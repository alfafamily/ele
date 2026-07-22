import tempfile

from accounts.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from employees.models import Employee
from rest_framework.test import APITestCase
from storage import backends as storage_backends

from .models import Equipment, EquipmentType

_TEST_MEDIA_ROOT = tempfile.mkdtemp(prefix="ele-equipment-tests-")


def _reset_local_backend():
    storage_backends._INSTANCES.pop("local", None)


class EquipmentFullLifecycleTests(APITestCase):
    """Чек-лист «Готово когда» Фазы 4: тип с реквизитами -> оборудование с
    заполненными реквизитами -> привязка лицензии -> блокировка списания ->
    «отвязать и списать» -> блокировка удаления Типа / архивирование ->
    счётчик в предупреждении об обязательном реквизите задним числом."""

    def setUp(self):
        self.admin = User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=self.admin)

    def test_full_lifecycle(self):
        resp = self.client.post("/api/equipment-types/", {"name": "Ноутбук", "allows_license": True}, format="json")
        self.assertEqual(resp.status_code, 201, resp.data)
        type_id = resp.data["id"]
        model_field_id = next(f["id"] for f in resp.data["fields"] if f["name"] == "Модель")
        self.assertTrue(next(f["is_locked"] for f in resp.data["fields"] if f["name"] == "Модель"))

        resp = self.client.post(
            f"/api/equipment-types/{type_id}/fields/",
            {"name": "Серийный номер", "value_type": "text", "is_required": True},
            format="json",
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        serial_field_id = resp.data["id"]

        # Без обязательного реквизита — отклонено.
        resp = self.client.post(
            "/api/equipment/", {"inventory_number": "INV-001", "equipment_type": type_id}, format="json"
        )
        self.assertEqual(resp.status_code, 400, resp.data)
        self.assertFalse(Equipment.objects.filter(inventory_number="INV-001").exists())

        resp = self.client.post(
            "/api/equipment/",
            {
                "inventory_number": "INV-001",
                "equipment_type": type_id,
                "field_values_input": [
                    {"field": model_field_id, "value": "Latitude 5540"},
                    {"field": serial_field_id, "value": "SN12345"},
                ],
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        equipment_id = resp.data["id"]
        self.assertEqual(resp.data["type_and_model"], "Ноутбук Latitude 5540")

        resp = self.client.post("/api/license-types/", {"name": "Утилита", "kind": "software"}, format="json")
        license_type_id = resp.data["id"]
        key_field_id = next(f["id"] for f in resp.data["fields"] if f["is_locked"])
        resp = self.client.post(
            "/api/licenses/",
            {
                "license_type": license_type_id,
                "equipment": equipment_id,
                "field_values_input": [{"field": key_field_id, "value": "LIC-KEY-1"}],
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        license_id = resp.data["id"]

        resp = self.client.get(f"/api/equipment/{equipment_id}/")
        self.assertEqual(len(resp.data["licenses"]), 1)
        self.assertEqual(resp.data["licenses"][0]["license_type_name"], "Утилита")

        resp = self.client.post(f"/api/equipment/{equipment_id}/write-off/", format="json")
        self.assertEqual(resp.status_code, 409, resp.data)
        self.assertEqual(len(resp.data["licenses"]), 1)

        resp = self.client.post(
            f"/api/equipment/{equipment_id}/write-off/", {"detach_licenses": True}, format="json"
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertTrue(resp.data["is_written_off"])
        self.assertIsNotNone(resp.data["written_off_at"])
        self.assertEqual(resp.data["licenses"], [])  # отвязана, значит больше не в блоке "Установленные лицензии"

        resp = self.client.get(f"/api/licenses/{license_id}/")
        self.assertIsNone(resp.data["equipment"])

        resp = self.client.delete(f"/api/equipment-types/{type_id}/")
        self.assertEqual(resp.status_code, 409)

        resp = self.client.patch(f"/api/equipment-types/{type_id}/", {"is_archived": True}, format="json")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertTrue(resp.data["is_archived"])

        resp = self.client.get(f"/api/equipment-types/{type_id}/fields/{model_field_id}/impact/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["affected_count"], 0)

        # Второй объект без «Серийного номера» -> счётчик impact = 1.
        equipment2 = Equipment.objects.create(
            inventory_number="INV-002", equipment_type_id=type_id
        )
        resp = self.client.get(f"/api/equipment-types/{type_id}/fields/{serial_field_id}/impact/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["affected_count"], 1)

    def test_locked_base_field_cannot_be_renamed_or_required(self):
        resp = self.client.post("/api/equipment-types/", {"name": "Монитор"}, format="json")
        type_id = resp.data["id"]
        model_field_id = next(f["id"] for f in resp.data["fields"] if f["name"] == "Модель")

        resp = self.client.patch(
            f"/api/equipment-types/{type_id}/fields/{model_field_id}/", {"name": "Модель2"}, format="json"
        )
        self.assertEqual(resp.status_code, 400)

        resp = self.client.patch(
            f"/api/equipment-types/{type_id}/fields/{model_field_id}/", {"is_required": True}, format="json"
        )
        self.assertEqual(resp.status_code, 400)

        resp = self.client.delete(f"/api/equipment-types/{type_id}/fields/{model_field_id}/")
        self.assertEqual(resp.status_code, 409)


@override_settings(MEDIA_ROOT=_TEST_MEDIA_ROOT)
class EquipmentInventoryUniquenessTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=self.admin)
        self.eq_type = EquipmentType.objects.create(name="ПК")

    def test_duplicate_inventory_number_rejected(self):
        Equipment.objects.create(inventory_number="INV-1", equipment_type=self.eq_type)
        resp = self.client.post(
            "/api/equipment/", {"inventory_number": "INV-1", "equipment_type": self.eq_type.id}, format="json"
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("inventory_number", resp.data["errors"])

    def test_duplicate_rejected_even_if_other_is_written_off(self):
        Equipment.objects.create(inventory_number="INV-2", equipment_type=self.eq_type, is_written_off=True)
        resp = self.client.post(
            "/api/equipment/", {"inventory_number": "INV-2", "equipment_type": self.eq_type.id}, format="json"
        )
        self.assertEqual(resp.status_code, 400)

    def test_same_equipment_keeps_its_number_on_update(self):
        eq = Equipment.objects.create(inventory_number="INV-3", equipment_type=self.eq_type)
        resp = self.client.patch(
            f"/api/equipment/{eq.id}/", {"inventory_number": "INV-3"}, format="json"
        )
        self.assertEqual(resp.status_code, 200, resp.data)


class EquipmentFieldFileUploadTests(APITestCase):
    """Реквизит типа «файл»: не более 20 МБ, проверка на сервере
    (не только на фронте)."""

    def setUp(self):
        _reset_local_backend()
        self.admin = User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post("/api/equipment-types/", {"name": "Ноутбук"}, format="json")
        self.type_id = resp.data["id"]
        resp = self.client.post(
            f"/api/equipment-types/{self.type_id}/fields/",
            {"name": "Акт приёма-передачи", "value_type": "file", "is_required": False},
            format="json",
        )
        self.field_id = resp.data["id"]
        self.equipment = Equipment.objects.create(inventory_number="EQ-FILE-1", equipment_type_id=self.type_id)

    def test_upload_accepts_small_file(self):
        resp = self.client.post(
            f"/api/equipment/{self.equipment.id}/field-values/{self.field_id}/file/",
            {"file": SimpleUploadedFile("akt.pdf", b"%PDF-1.4 fake content", content_type="application/pdf")},
            format="multipart",
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data["value_file"]["original_filename"], "akt.pdf")

    def test_upload_rejects_file_over_20mb(self):
        oversized = SimpleUploadedFile("big.pdf", b"0" * (20 * 1024 * 1024 + 1), content_type="application/pdf")
        resp = self.client.post(
            f"/api/equipment/{self.equipment.id}/field-values/{self.field_id}/file/",
            {"file": oversized},
            format="multipart",
        )
        self.assertEqual(resp.status_code, 400)

    def test_upload_rejects_non_file_field(self):
        resp = self.client.post(
            f"/api/equipment-types/{self.type_id}/fields/",
            {"name": "Серийный номер", "value_type": "text", "is_required": False},
            format="json",
        )
        text_field_id = resp.data["id"]
        resp = self.client.post(
            f"/api/equipment/{self.equipment.id}/field-values/{text_field_id}/file/",
            {"file": SimpleUploadedFile("x.txt", b"x")},
            format="multipart",
        )
        self.assertEqual(resp.status_code, 400)


class EquipmentListAndBoolFieldTests(APITestCase):
    """Реквизит «Список» (выбор из значений) и булев реквизит с явным
    Да/Нет — «Нет» (False) считается заполненным, отсутствие выбора — нет."""

    def setUp(self):
        self.admin = User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post("/api/equipment-types/", {"name": "Ноутбук"}, format="json")
        self.type_id = resp.data["id"]

    def test_list_field_options_and_selection(self):
        resp = self.client.post(
            f"/api/equipment-types/{self.type_id}/fields/",
            {
                "name": "Цвет",
                "value_type": "list",
                "is_required": True,
                "options": [{"value": "Чёрный", "order": 0}, {"value": "Серебристый", "order": 1}],
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        field_id = resp.data["id"]
        self.assertEqual([o["value"] for o in resp.data["options"]], ["Чёрный", "Серебристый"])

        # Обязательный «Список» без выбора — отклонено.
        resp = self.client.post(
            "/api/equipment/", {"inventory_number": "L-1", "equipment_type": self.type_id}, format="json"
        )
        self.assertEqual(resp.status_code, 400, resp.data)

        # Значение вне списка — отклонено.
        resp = self.client.post(
            "/api/equipment/",
            {
                "inventory_number": "L-1",
                "equipment_type": self.type_id,
                "field_values_input": [{"field": field_id, "value": "Розовый"}],
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 400, resp.data)

        # Корректное значение из списка — принято.
        resp = self.client.post(
            "/api/equipment/",
            {
                "inventory_number": "L-1",
                "equipment_type": self.type_id,
                "field_values_input": [{"field": field_id, "value": "Чёрный"}],
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        fv = next(f for f in resp.data["field_values"] if f["field"] == field_id)
        self.assertEqual(fv["value_type"], "list")
        self.assertEqual(fv["value"], "Чёрный")

    def test_list_options_editable_after_creation(self):
        resp = self.client.post(
            f"/api/equipment-types/{self.type_id}/fields/",
            {"name": "Размер", "value_type": "list", "options": [{"value": "S", "order": 0}]},
            format="json",
        )
        field_id = resp.data["id"]
        resp = self.client.patch(
            f"/api/equipment-types/{self.type_id}/fields/{field_id}/",
            {"options": [{"value": "S", "order": 0}, {"value": "M", "order": 1}]},
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual([o["value"] for o in resp.data["options"]], ["S", "M"])

    def test_bool_false_satisfies_required(self):
        resp = self.client.post(
            f"/api/equipment-types/{self.type_id}/fields/",
            {"name": "Гарантия", "value_type": "bool", "is_required": True},
            format="json",
        )
        bool_id = resp.data["id"]

        # Без значения — не заполнено.
        resp = self.client.post(
            "/api/equipment/", {"inventory_number": "B-1", "equipment_type": self.type_id}, format="json"
        )
        self.assertEqual(resp.status_code, 400, resp.data)

        # Явный «Нет» (False) — заполнено.
        resp = self.client.post(
            "/api/equipment/",
            {
                "inventory_number": "B-1",
                "equipment_type": self.type_id,
                "field_values_input": [{"field": bool_id, "value": False}],
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        fv = next(f for f in resp.data["field_values"] if f["field"] == bool_id)
        self.assertEqual(fv["value"], False)


class EquipmentRequiredFieldEdgeCasesTests(APITestCase):
    """Обязательные реквизиты, добавленные к Типу задним числом, и обязательный
    файловый реквизит при создании объекта."""

    def setUp(self):
        self.admin = User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post("/api/equipment-types/", {"name": "Ноутбук"}, format="json")
        self.type_id = resp.data["id"]

    def test_required_field_added_after_creation_saves_on_edit(self):
        # Объект создан, когда обязательного реквизита ещё не было.
        resp = self.client.post(
            "/api/equipment/", {"inventory_number": "AF-1", "equipment_type": self.type_id}, format="json"
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        eq_id = resp.data["id"]

        # Теперь добавляем обязательный булев реквизит.
        resp = self.client.post(
            f"/api/equipment-types/{self.type_id}/fields/",
            {"name": "Флаг", "value_type": "bool", "is_required": True},
            format="json",
        )
        field_id = resp.data["id"]

        # Редактирование с заполненным значением должно проходить (раньше
        # устаревший prefetch-кеш давал ложное «не заполнено»).
        resp = self.client.patch(
            f"/api/equipment/{eq_id}/",
            {
                "inventory_number": "AF-1",
                "equipment_type": self.type_id,
                "field_values_input": [{"field": field_id, "value": True}],
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        fv = next(f for f in resp.data["field_values"] if f["field"] == field_id)
        self.assertEqual(fv["value"], True)

    def test_required_file_field_does_not_block_creation(self):
        resp = self.client.post(
            f"/api/equipment-types/{self.type_id}/fields/",
            {"name": "Акт", "value_type": "file", "is_required": True},
            format="json",
        )
        # Файл нельзя приложить до создания объекта — обязательный файловый
        # реквизит не должен блокировать создание.
        resp = self.client.post(
            "/api/equipment/", {"inventory_number": "RF-1", "equipment_type": self.type_id}, format="json"
        )
        self.assertEqual(resp.status_code, 201, resp.data)

    def test_required_file_field_still_enforced_on_edit(self):
        resp = self.client.post(
            f"/api/equipment-types/{self.type_id}/fields/",
            {"name": "Акт", "value_type": "file", "is_required": True},
            format="json",
        )
        resp = self.client.post(
            "/api/equipment/", {"inventory_number": "RF-2", "equipment_type": self.type_id}, format="json"
        )
        eq_id = resp.data["id"]
        # При редактировании без приложенного файла обязательность действует.
        resp = self.client.patch(
            f"/api/equipment/{eq_id}/",
            {"inventory_number": "RF-2", "equipment_type": self.type_id},
            format="json",
        )
        self.assertEqual(resp.status_code, 400, resp.data)


@override_settings(MEDIA_ROOT=_TEST_MEDIA_ROOT)
class EquipmentMultipleFilesTests(APITestCase):
    """Файловый реквизит с allow_multiple — несколько файлов, точечное
    удаление по id."""

    def setUp(self):
        _reset_local_backend()
        self.admin = User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post("/api/equipment-types/", {"name": "Ноутбук"}, format="json")
        self.type_id = resp.data["id"]
        resp = self.client.post(
            f"/api/equipment-types/{self.type_id}/fields/",
            {"name": "Документы", "value_type": "file", "allow_multiple": True},
            format="json",
        )
        self.assertTrue(resp.data["allow_multiple"])
        self.field_id = resp.data["id"]
        self.equipment = Equipment.objects.create(inventory_number="EQ-MF-1", equipment_type_id=self.type_id)

    def _upload(self, name):
        return self.client.post(
            f"/api/equipment/{self.equipment.id}/field-values/{self.field_id}/file/",
            {"file": SimpleUploadedFile(name, b"%PDF-1.4 fake", content_type="application/pdf")},
            format="multipart",
        )

    def test_multiple_files_in_single_request(self):
        # Выбор нескольких файлов за раз в диалоге — один POST с несколькими "file".
        resp = self.client.post(
            f"/api/equipment/{self.equipment.id}/field-values/{self.field_id}/file/",
            {
                "file": [
                    SimpleUploadedFile("a.pdf", b"%PDF a", content_type="application/pdf"),
                    SimpleUploadedFile("b.pdf", b"%PDF b", content_type="application/pdf"),
                ]
            },
            format="multipart",
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(len(resp.data["value_files"]), 2)
        names = {f["file"]["original_filename"] for f in resp.data["value_files"]}
        self.assertEqual(names, {"a.pdf", "b.pdf"})

    def test_multiple_upload_and_delete_one(self):
        resp = self._upload("a.pdf")
        self.assertEqual(resp.status_code, 200, resp.data)
        resp = self._upload("b.pdf")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(len(resp.data["value_files"]), 2)
        first_id = resp.data["value_files"][0]["id"]

        resp = self.client.delete(
            f"/api/equipment/{self.equipment.id}/field-values/{self.field_id}/files/{first_id}/"
        )
        self.assertEqual(resp.status_code, 204)

        resp = self.client.get(f"/api/equipment/{self.equipment.id}/")
        fv = next(f for f in resp.data["field_values"] if f["field"] == self.field_id)
        self.assertEqual(len(fv["value_files"]), 1)
        self.assertEqual(fv["value_files"][0]["file"]["original_filename"], "b.pdf")


class EquipmentAccessMatrixTests(APITestCase):
    """Сотрудник видит только своё; Сотрудник+Наблюдатель — всё, но без записи."""

    def setUp(self):
        self.admin = User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post("/api/equipment-types/", {"name": "ПК"}, format="json")
        self.type_id = resp.data["id"]

        self.emp_mine = Employee.objects.create(first_name="Иван", last_name="Прозоров")
        self.emp_other = Employee.objects.create(first_name="Другой", last_name="Сотрудник")
        self.eq_mine = Equipment.objects.create(inventory_number="EQ-MINE", equipment_type_id=self.type_id, employee=self.emp_mine)
        self.eq_other = Equipment.objects.create(inventory_number="EQ-OTHER", equipment_type_id=self.type_id, employee=self.emp_other)
        self.eq_free = Equipment.objects.create(inventory_number="EQ-FREE", equipment_type_id=self.type_id)

        self.worker = User.objects.create_user(email="worker@example.com", password="Str0ng!Pass1", employee=self.emp_mine)
        self.observer = User.objects.create_user(
            email="observer@example.com", password="Str0ng!Pass1", employee=self.emp_other, is_observer=True
        )

    def test_employee_sees_only_own_equipment(self):
        self.client.force_authenticate(user=self.worker)
        resp = self.client.get("/api/equipment/")
        ids = {row["id"] for row in resp.data["results"]}
        self.assertEqual(ids, {self.eq_mine.id})

    def test_employee_cannot_write(self):
        self.client.force_authenticate(user=self.worker)
        resp = self.client.post(
            "/api/equipment/", {"inventory_number": "X", "equipment_type": self.type_id}, format="json"
        )
        self.assertEqual(resp.status_code, 403)

    def test_observer_sees_all_but_cannot_write(self):
        self.client.force_authenticate(user=self.observer)
        resp = self.client.get("/api/equipment/")
        ids = {row["id"] for row in resp.data["results"]}
        self.assertEqual(ids, {self.eq_mine.id, self.eq_other.id, self.eq_free.id})

        resp = self.client.post(
            "/api/equipment/", {"inventory_number": "X", "equipment_type": self.type_id}, format="json"
        )
        self.assertEqual(resp.status_code, 403)

    def test_employee_without_linked_employee_sees_nothing(self):
        lone = User.objects.create_user(email="lone@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=lone)
        resp = self.client.get("/api/equipment/")
        self.assertEqual(resp.data["results"], [])

    def test_licenses_section_forbidden_for_employee(self):
        self.client.force_authenticate(user=self.worker)
        resp = self.client.get("/api/licenses/")
        self.assertEqual(resp.status_code, 403)

    def test_types_forbidden_for_employee(self):
        self.client.force_authenticate(user=self.worker)
        resp = self.client.get("/api/equipment-types/")
        self.assertEqual(resp.status_code, 403)


class EquipmentSearchTests(APITestCase):
    """Поиск по списку Оборудования: Учётный номер, ФИО Сотрудника, Тип, Модель."""

    def setUp(self):
        self.admin = User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post("/api/equipment-types/", {"name": "Ноутбук"}, format="json")
        self.type_id = resp.data["id"]
        self.model_field_id = next(f["id"] for f in resp.data["fields"] if f["name"] == "Модель")
        resp = self.client.post("/api/equipment-types/", {"name": "Принтер"}, format="json")
        self.type2_id = resp.data["id"]

        self.emp = Employee.objects.create(first_name="Анастасия", last_name="Стратиенко", position="Бухгалтер")
        resp = self.client.post(
            "/api/equipment/",
            {
                "inventory_number": "DESKTOP-98",
                "equipment_type": self.type_id,
                "employee": self.emp.id,
                "field_values_input": [{"field": self.model_field_id, "value": "ZALMAN"}],
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        self.eq1 = resp.data["id"]
        self.eq2 = Equipment.objects.create(inventory_number="PRN-777", equipment_type_id=self.type2_id)

    def _search_ids(self, term):
        resp = self.client.get("/api/equipment/", {"search": term})
        self.assertEqual(resp.status_code, 200, resp.data)
        return {row["id"] for row in resp.data["results"]}

    def test_search_by_inventory_number(self):
        self.assertEqual(self._search_ids("DESKTOP"), {self.eq1})

    def test_search_by_employee_last_name(self):
        self.assertEqual(self._search_ids("Стратиенко"), {self.eq1})

    def test_search_by_type(self):
        self.assertEqual(self._search_ids("Принтер"), {self.eq2.id})

    def test_search_by_model(self):
        self.assertEqual(self._search_ids("ZALMAN"), {self.eq1})

    def test_search_no_duplicate_rows(self):
        # join по field_values мог бы задвоить строку — проверяем distinct().
        resp = self.client.get("/api/equipment/", {"search": "DESKTOP"})
        ids = [row["id"] for row in resp.data["results"]]
        self.assertEqual(ids, [self.eq1])


class EquipmentPlacementTests(APITestCase):
    """B8 — размещение оборудования: мобильно / стационарно / склад."""

    def setUp(self):
        from locations.models import Building, Place, Room

        self.admin = User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=self.admin)
        self.emp = Employee.objects.create(first_name="Иван", last_name="Иванов")
        self.type_id = self.client.post("/api/equipment-types/", {"name": "ПК"}, format="json").data["id"]
        b = Building.objects.create(name="Главное")
        r = Room.objects.create(building=b, name="101")
        self.store = Place.objects.create(room=r, name="Склад", place_type=Place.PlaceType.STORAGE)
        self.wp = Place.objects.create(room=r, name="РМ-1", place_type=Place.PlaceType.WORKPLACE)

    def _make(self, **extra):
        payload = {"inventory_number": "INV-1", "equipment_type": self.type_id, **extra}
        return self.client.post("/api/equipment/", payload, format="json")

    def test_create_on_storage(self):
        resp = self._make(place=self.store.id)
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data["status"], "free")
        self.assertEqual(resp.data["place_detail"]["place_type"], "storage")

    def test_create_mobile(self):
        resp = self._make(employee=self.emp.id)
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data["status"], "assigned")

    def test_assign_stationary_then_unassign_to_storage(self):
        eq_id = self._make(place=self.store.id).data["id"]
        # Стационарно на рабочее место.
        r = self.client.post(f"/api/equipment/{eq_id}/assign/", {"mode": "stationary", "place": self.wp.id}, format="json")
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data["status"], "stationary")
        self.assertIsNone(r.data["employee"])
        # Открепление требует склад.
        r = self.client.post(f"/api/equipment/{eq_id}/unassign/", {}, format="json")
        self.assertEqual(r.status_code, 400, r.data)
        r = self.client.post(f"/api/equipment/{eq_id}/unassign/", {"place": self.wp.id}, format="json")
        self.assertEqual(r.status_code, 400, r.data)  # рабочее место — не склад
        r = self.client.post(f"/api/equipment/{eq_id}/unassign/", {"place": self.store.id}, format="json")
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data["status"], "free")

    def test_assign_stationary_requires_workplace(self):
        eq_id = self._make(place=self.store.id).data["id"]
        r = self.client.post(f"/api/equipment/{eq_id}/assign/", {"mode": "stationary", "place": self.store.id}, format="json")
        self.assertEqual(r.status_code, 400, r.data)

    def test_status_filter_stationary(self):
        eq_id = self._make(place=self.store.id).data["id"]
        self.client.post(f"/api/equipment/{eq_id}/assign/", {"mode": "stationary", "place": self.wp.id}, format="json")
        ids = [e["id"] for e in self.client.get("/api/equipment/", {"status": "stationary"}).data["results"]]
        self.assertIn(eq_id, ids)
        ids_free = [e["id"] for e in self.client.get("/api/equipment/", {"status": "free"}).data["results"]]
        self.assertNotIn(eq_id, ids_free)


class MaintenanceTests(APITestCase):
    """B13+. Регламентное техобслуживание: регламенты типа/индивидуальные,
    наследование планов, проведение ТО (в т.ч. отмена позиций), внеплановое ТО,
    статусы/индикация, фильтры, каскады архива/списания, права ролей."""

    def setUp(self):
        self.admin = User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=self.admin)

    def _make_type(self, maintenance_enabled=True):
        resp = self.client.post(
            "/api/equipment-types/",
            {"name": "Кондиционер", "maintenance_enabled": maintenance_enabled},
            format="json",
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data["maintenance_enabled"], maintenance_enabled)
        return resp.data["id"]

    def _make_equipment(self, type_id, inv="INV-TO-1"):
        resp = self.client.post(
            "/api/equipment/", {"inventory_number": inv, "equipment_type": type_id}, format="json"
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        return resp.data["id"]

    def _make_type_regulation(self, type_id, name="Плановое ТО", period_months=3, on_demand=False, items=None):
        payload = {
            "name": name,
            "period_months": period_months,
            "on_demand": on_demand,
            "items": items if items is not None else [{"kind": "work", "name": "Чистка", "quantity": "1"}],
        }
        resp = self.client.post(f"/api/equipment-types/{type_id}/regulations/", payload, format="json")
        self.assertEqual(resp.status_code, 201, resp.data)
        return resp.data["id"]

    def _regs(self, eq_id):
        resp = self.client.get(f"/api/equipment/{eq_id}/regulations/")
        self.assertEqual(resp.status_code, 200, resp.data)
        return {r["id"]: r for r in resp.data}

    def _set_date(self, eq_id, reg_id, date):
        return self.client.patch(
            f"/api/equipment/{eq_id}/regulations/{reg_id}/plan/", {"next_planned_date": date}, format="json"
        )

    def _perform(self, eq_id, **payload):
        return self.client.post(f"/api/equipment/{eq_id}/maintenance/", payload, format="json")

    def test_type_flag_editable(self):
        type_id = self._make_type(maintenance_enabled=False)
        resp = self.client.patch(
            f"/api/equipment-types/{type_id}/", {"maintenance_enabled": True}, format="json"
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertTrue(resp.data["maintenance_enabled"])

    def test_summary_disabled_when_flag_off(self):
        type_id = self._make_type(maintenance_enabled=False)
        eq_id = self._make_equipment(type_id)
        resp = self.client.get(f"/api/equipment/{eq_id}/")
        self.assertFalse(resp.data["maintenance_summary"]["enabled"])
        self.assertFalse(resp.data["type_maintenance_enabled"])

    def test_type_regulation_inherited_by_equipment(self):
        type_id = self._make_type()
        # Оборудование, созданное ДО регламента — план заводится при создании рег.
        eq_before = self._make_equipment(type_id, inv="INV-BEFORE")
        reg_id = self._make_type_regulation(type_id)
        regs = self._regs(eq_before)
        self.assertIn(reg_id, regs)
        # Оборудование, созданное ПОСЛЕ регламента — план при создании экземпляра.
        eq_after = self._make_equipment(type_id, inv="INV-AFTER")
        self.assertIn(reg_id, self._regs(eq_after))

    def test_perform_by_regulation_sets_plan_date(self):
        from datetime import timedelta

        from django.utils import timezone

        type_id = self._make_type()
        reg_id = self._make_type_regulation(type_id, period_months=3)
        eq_id = self._make_equipment(type_id)

        future = (timezone.localdate() + timedelta(days=30)).isoformat()
        resp = self._perform(
            eq_id,
            regulation=reg_id,
            next_planned_date=future,
            items=[{"kind": "work", "name": "Чистка", "quantity": "1", "from_regulation": True}],
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        regs = self._regs(eq_id)
        self.assertEqual(regs[reg_id]["plan"]["next_planned_date"], future)
        self.assertEqual(regs[reg_id]["status"], "scheduled")
        # В истории — имя регламента.
        rows = self.client.get(f"/api/equipment/{eq_id}/history/").data
        maint = [r for r in rows if r["category"] == "maintenance"]
        self.assertTrue(any("Плановое ТО" in r["label"] for r in maint), maint)

    def test_perform_requires_active_item(self):
        from datetime import timedelta

        from django.utils import timezone

        type_id = self._make_type()
        reg_id = self._make_type_regulation(type_id)
        eq_id = self._make_equipment(type_id)
        future = (timezone.localdate() + timedelta(days=10)).isoformat()
        # Все позиции отменены — нельзя провести.
        resp = self._perform(
            eq_id,
            regulation=reg_id,
            next_planned_date=future,
            items=[{"kind": "work", "name": "Чистка", "quantity": "1", "from_regulation": True, "is_cancelled": True, "cancel_reason": "не требуется"}],
        )
        self.assertEqual(resp.status_code, 400, resp.data)

    def test_cancel_item_requires_reason_and_hits_history(self):
        from datetime import timedelta

        from django.utils import timezone

        type_id = self._make_type()
        reg_id = self._make_type_regulation(
            type_id,
            items=[{"kind": "work", "name": "Чистка", "quantity": "1"}, {"kind": "material", "name": "Фильтр", "quantity": "1"}],
        )
        eq_id = self._make_equipment(type_id)
        future = (timezone.localdate() + timedelta(days=10)).isoformat()
        # Отмена без причины — 400.
        bad = self._perform(
            eq_id, regulation=reg_id, next_planned_date=future,
            items=[
                {"kind": "work", "name": "Чистка", "quantity": "1", "from_regulation": True},
                {"kind": "material", "name": "Фильтр", "quantity": "1", "from_regulation": True, "is_cancelled": True},
            ],
        )
        self.assertEqual(bad.status_code, 400, bad.data)
        # С причиной — ок, причина в истории.
        ok = self._perform(
            eq_id, regulation=reg_id, next_planned_date=future,
            items=[
                {"kind": "work", "name": "Чистка", "quantity": "1", "from_regulation": True},
                {"kind": "material", "name": "Фильтр", "quantity": "1", "from_regulation": True, "is_cancelled": True, "cancel_reason": "остался с прошлого раза"},
            ],
        )
        self.assertEqual(ok.status_code, 200, ok.data)
        rows = self.client.get(f"/api/equipment/{eq_id}/history/").data
        maint = [r for r in rows if r["category"] == "maintenance"]
        text = str(maint)
        self.assertIn("отменено", text)
        self.assertIn("остался с прошлого раза", text)

    def test_date_range_validation(self):
        from datetime import timedelta

        from django.utils import timezone

        today = timezone.localdate()
        type_id = self._make_type()
        reg_id = self._make_type_regulation(type_id, period_months=3)
        eq_id = self._make_equipment(type_id)
        item = [{"kind": "work", "name": "Чистка", "quantity": "1", "from_regulation": True}]
        # Прошлое — 400.
        r1 = self._perform(eq_id, regulation=reg_id, next_planned_date=(today - timedelta(days=1)).isoformat(), items=item)
        self.assertEqual(r1.status_code, 400, r1.data)
        # Позже расчётной (сегодня + 3 мес ≈ 90 дн) — 400.
        r2 = self._perform(eq_id, regulation=reg_id, next_planned_date=(today + timedelta(days=200)).isoformat(), items=item)
        self.assertEqual(r2.status_code, 400, r2.data)
        # Без даты для периодического — 400.
        r3 = self._perform(eq_id, regulation=reg_id, items=item)
        self.assertEqual(r3.status_code, 400, r3.data)

    def test_unplanned_maintenance(self):
        type_id = self._make_type()
        eq_id = self._make_equipment(type_id)
        # Внеплановое: regulation=null, без даты.
        resp = self._perform(
            eq_id, regulation=None, comment="Аварийно",
            items=[{"kind": "work", "name": "Ремонт", "quantity": "1"}],
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        rows = self.client.get(f"/api/equipment/{eq_id}/history/").data
        maint = [r for r in rows if r["category"] == "maintenance"]
        self.assertTrue(any("внеплановое" in r["label"].lower() for r in maint), maint)

    def test_on_demand_regulation(self):
        type_id = self._make_type()
        reg_id = self._make_type_regulation(type_id, name="По потребности", on_demand=True, period_months=None)
        eq_id = self._make_equipment(type_id)
        regs = self._regs(eq_id)
        self.assertTrue(regs[reg_id]["on_demand"])
        self.assertIsNone(regs[reg_id]["status"])
        # Проведение без даты — ок.
        resp = self._perform(
            eq_id, regulation=reg_id, items=[{"kind": "work", "name": "Осмотр", "quantity": "1", "from_regulation": True}]
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        # По потребности не влияет на индикацию.
        summary = self.client.get(f"/api/equipment/{eq_id}/").data["maintenance_summary"]
        self.assertIsNone(summary["critical"])
        self.assertFalse(summary["has_unplanned"])

    def test_summary_critical_and_unplanned(self):
        from datetime import timedelta

        from django.utils import timezone

        from .models import EquipmentMaintenancePlan

        today = timezone.localdate()
        type_id = self._make_type()
        reg_overdue = self._make_type_regulation(type_id, name="Просроч")
        reg_unset = self._make_type_regulation(type_id, name="Без даты")
        eq_id = self._make_equipment(type_id)
        # Один регламент просрочен (через ORM), другой — без даты.
        EquipmentMaintenancePlan.objects.filter(equipment_id=eq_id, regulation_id=reg_overdue).update(
            next_planned_date=today - timedelta(days=3)
        )
        summary = self.client.get(f"/api/equipment/{eq_id}/").data["maintenance_summary"]
        self.assertEqual(summary["critical"], "overdue")
        self.assertTrue(summary["has_unplanned"])

    def test_list_filters(self):
        from datetime import timedelta

        from django.utils import timezone

        from .models import EquipmentMaintenancePlan

        today = timezone.localdate()
        type_id = self._make_type()
        reg_id = self._make_type_regulation(type_id)

        overdue_id = self._make_equipment(type_id, inv="INV-OVD")
        EquipmentMaintenancePlan.objects.filter(equipment_id=overdue_id, regulation_id=reg_id).update(
            next_planned_date=today - timedelta(days=2)
        )
        due_id = self._make_equipment(type_id, inv="INV-DUE")
        EquipmentMaintenancePlan.objects.filter(equipment_id=due_id, regulation_id=reg_id).update(
            next_planned_date=today + timedelta(days=2)
        )
        unset_id = self._make_equipment(type_id, inv="INV-UNSET")  # план без даты

        ids = lambda params: {e["id"] for e in self.client.get("/api/equipment/", params).data["results"]}

        self.assertEqual(ids({"to_overdue": "1"}), {overdue_id})
        self.assertEqual(ids({"to_due": "1"}), {due_id})
        self.assertEqual(ids({"to_unset": "1"}), {unset_id})
        self.assertEqual(ids({"to_due": "1", "to_overdue": "1"}), {overdue_id, due_id})

    def test_archive_type_regulation_cascade(self):
        from datetime import timedelta

        from django.utils import timezone

        from .models import EquipmentMaintenancePlan

        today = timezone.localdate()
        type_id = self._make_type()
        reg_id = self._make_type_regulation(type_id)
        eq_id = self._make_equipment(type_id)
        self._set_date(eq_id, reg_id, (today + timedelta(days=10)).isoformat())

        # Архивируем регламент типа — исчезает из списка оборудования, план
        # отменён и дата обнулена (проверяем через ORM).
        resp = self.client.patch(
            f"/api/equipment-types/{type_id}/regulations/{reg_id}/", {"is_archived": True}, format="json"
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertNotIn(reg_id, self._regs(eq_id))
        plan = EquipmentMaintenancePlan.objects.get(equipment_id=eq_id, regulation_id=reg_id)
        self.assertTrue(plan.is_cancelled)
        self.assertIsNone(plan.next_planned_date)

        # Возврат — снова активен у оборудования, но дата не задана.
        self.client.patch(
            f"/api/equipment-types/{type_id}/regulations/{reg_id}/", {"is_archived": False}, format="json"
        )
        regs = self._regs(eq_id)
        self.assertIn(reg_id, regs)
        self.assertFalse(regs[reg_id]["plan"]["is_cancelled"])
        self.assertIsNone(regs[reg_id]["plan"]["next_planned_date"])

    def test_cancel_regulation_for_equipment(self):
        from datetime import timedelta

        from django.utils import timezone

        today = timezone.localdate()
        type_id = self._make_type()
        reg_id = self._make_type_regulation(type_id)
        eq_id = self._make_equipment(type_id)
        self._set_date(eq_id, reg_id, (today + timedelta(days=2)).isoformat())

        # Отмена регламента для экземпляра — из индикации уходит.
        resp = self.client.patch(
            f"/api/equipment/{eq_id}/regulations/{reg_id}/plan/", {"is_cancelled": True}, format="json"
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        summary = self.client.get(f"/api/equipment/{eq_id}/").data["maintenance_summary"]
        self.assertIsNone(summary["critical"])
        self.assertFalse(summary["has_unplanned"])
        # Проведение по отменённому — 409.
        bad = self._perform(
            eq_id, regulation=reg_id, next_planned_date=(today + timedelta(days=5)).isoformat(),
            items=[{"kind": "work", "name": "x", "quantity": "1"}],
        )
        self.assertEqual(bad.status_code, 409, bad.data)

    def test_individual_regulation(self):
        from datetime import timedelta

        from django.utils import timezone

        type_id = self._make_type()
        eq_id = self._make_equipment(type_id)
        first_date = (timezone.localdate() + timedelta(days=20)).isoformat()
        resp = self.client.post(
            f"/api/equipment/{eq_id}/regulations/",
            {
                "name": "Личный",
                "period_months": 6,
                "items": [{"kind": "work", "name": "Смазка", "quantity": "1"}],
                "next_planned_date": first_date,  # дата первого ТО сразу при создании
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        regs = self._regs(eq_id)
        individual = [r for r in regs.values() if r["scope"] == "individual"]
        self.assertEqual(len(individual), 1)
        reg_id = individual[0]["id"]
        # Дата первого ТО задана при создании.
        self.assertEqual(regs[reg_id]["plan"]["next_planned_date"], first_date)
        # Архивирование индивидуального — план отменён.
        self.client.delete(f"/api/equipment/{eq_id}/regulations/{reg_id}/")
        self.assertTrue(self._regs(eq_id)[reg_id]["plan"]["is_cancelled"])

    def test_write_off_cascade(self):
        type_id = self._make_type()
        reg_id = self._make_type_regulation(type_id)
        eq_id = self._make_equipment(type_id)
        self.client.post(
            f"/api/equipment/{eq_id}/regulations/",
            {"name": "Личный", "period_months": 6, "items": [{"kind": "work", "name": "Смазка", "quantity": "1"}]},
            format="json",
        )
        self.client.post(f"/api/equipment/{eq_id}/write-off/", {}, format="json")
        regs = self._regs(eq_id)
        # Все планы отменены; индивидуальный регламент — в архиве.
        self.assertTrue(all(r["plan"]["is_cancelled"] for r in regs.values()))
        self.assertTrue(any(r["scope"] == "individual" and r["is_archived"] for r in regs.values()))
        # ТО по списанному — 409.
        resp = self._perform(eq_id, regulation=reg_id, items=[{"kind": "work", "name": "x", "quantity": "1"}])
        self.assertEqual(resp.status_code, 409, resp.data)

    def test_permissions_matrix(self):
        from datetime import timedelta

        from django.utils import timezone

        today = timezone.localdate()
        type_id = self._make_type()
        reg_id = self._make_type_regulation(type_id)
        eq_id = self._make_equipment(type_id)
        item = [{"kind": "work", "name": "Чистка", "quantity": "1", "from_regulation": True}]
        future = (today + timedelta(days=10)).isoformat()

        maint = User.objects.create_user(email="maint@example.com", password="Str0ng!Pass1", role="maintenance")
        acc = User.objects.create_user(email="acc@example.com", password="Str0ng!Pass1", role="accountant")
        emp = User.objects.create_user(email="emp@example.com", password="Str0ng!Pass1", role="employee")

        # Роль ТО: проводит, но не управляет регламентами/планом.
        self.client.force_authenticate(user=maint)
        self.assertEqual(self._perform(eq_id, regulation=reg_id, next_planned_date=future, items=item).status_code, 200)
        self.assertEqual(
            self.client.post(f"/api/equipment-types/{type_id}/regulations/", {"name": "x", "period_months": 1, "items": item}, format="json").status_code,
            403,
        )
        self.assertEqual(
            self.client.patch(f"/api/equipment/{eq_id}/regulations/{reg_id}/plan/", {"is_cancelled": True}, format="json").status_code,
            403,
        )

        # Ответственный за учёт без флага — ни провести, ни управлять.
        self.client.force_authenticate(user=acc)
        self.assertEqual(self._perform(eq_id, regulation=reg_id, next_planned_date=future, items=item).status_code, 403)
        self.assertEqual(
            self.client.patch(f"/api/equipment/{eq_id}/regulations/{reg_id}/plan/", {"is_cancelled": True}, format="json").status_code,
            403,
        )

        # B23: с флагом can_maintain (проведение ТО) — только проводит; управление
        # планом/регламентами по-прежнему закрыто (нужен отдельный флаг).
        acc.can_maintain = True
        acc.save(update_fields=["can_maintain"])
        self.assertEqual(self._perform(eq_id, regulation=reg_id, next_planned_date=future, items=item).status_code, 200)
        self.assertEqual(
            self.client.patch(f"/api/equipment/{eq_id}/regulations/{reg_id}/plan/", {"is_cancelled": True}, format="json").status_code,
            403,
        )

        # B23: с флагом can_manage_regulations — управление регламентами/планом.
        acc.can_manage_regulations = True
        acc.save(update_fields=["can_manage_regulations"])
        self.assertEqual(
            self.client.patch(f"/api/equipment/{eq_id}/regulations/{reg_id}/plan/", {"is_cancelled": True}, format="json").status_code,
            200,
        )

        # Обычный сотрудник — не проводит.
        self.client.force_authenticate(user=emp)
        self.assertIn(self._perform(eq_id, regulation=reg_id, items=item).status_code, (403, 404))

    def test_maintenance_type_scope(self):
        """B23. Область типов: ограниченный набор — проведение ТО только по
        выбранным типам; роль ТО видит в списке только своё оборудование, а
        учётчик — всё оборудование (ограничено лишь проведение)."""
        from datetime import timedelta

        from django.utils import timezone

        future = (timezone.localdate() + timedelta(days=10)).isoformat()
        type_a = self._make_type()
        type_b = self._make_type()
        reg_a = self._make_type_regulation(type_a)
        eq_a = self._make_equipment(type_a, inv="INV-A")
        eq_b = self._make_equipment(type_b, inv="INV-B")
        item = [{"kind": "work", "name": "Чистка", "quantity": "1", "from_regulation": True}]

        # Роль ТО, ограниченная типом A.
        maint = User.objects.create_user(email="m2@example.com", password="Str0ng!Pass1", role="maintenance")
        maint.maintenance_all_types = False
        maint.save(update_fields=["maintenance_all_types"])
        maint.maintenance_types.set([type_a])
        self.client.force_authenticate(user=maint)
        # Список — только оборудование типа A.
        ids = [e["id"] for e in self.client.get("/api/equipment/").data["results"]]
        self.assertIn(eq_a, ids)
        self.assertNotIn(eq_b, ids)
        # Проведение ТО — по A можно; eq_b вне области вообще не виден роли ТО (404).
        self.assertEqual(self._perform(eq_a, regulation=reg_a, next_planned_date=future, items=item).status_code, 200)
        self.assertEqual(self._perform(eq_b, items=item).status_code, 404)

        # Учётчик с can_maintain, ограниченный типом A: видит ВСЁ оборудование,
        # но проводит ТО только по A.
        acc = User.objects.create_user(email="a2@example.com", password="Str0ng!Pass1", role="accountant")
        acc.can_maintain = True
        acc.maintenance_all_types = False
        acc.save(update_fields=["can_maintain", "maintenance_all_types"])
        acc.maintenance_types.set([type_a])
        self.client.force_authenticate(user=acc)
        ids = [e["id"] for e in self.client.get("/api/equipment/").data["results"]]
        self.assertIn(eq_a, ids)
        self.assertIn(eq_b, ids)
        self.assertEqual(self._perform(eq_a, regulation=reg_a, next_planned_date=future, items=item).status_code, 200)
        self.assertEqual(self._perform(eq_b, items=item).status_code, 403)

        # Роль ТО с «все типы» видит только оборудование типов с включённым ТО —
        # оборудование типа без ТО ей недоступно (в списке нет, карточка 404).
        self.client.force_authenticate(user=self.admin)
        type_c = self._make_type(maintenance_enabled=False)
        eq_c = self._make_equipment(type_c, inv="INV-C")
        maint_all = User.objects.create_user(email="m3@example.com", password="Str0ng!Pass1", role="maintenance")
        self.assertTrue(maint_all.maintenance_all_types)
        self.client.force_authenticate(user=maint_all)
        ids = [e["id"] for e in self.client.get("/api/equipment/").data["results"]]
        self.assertIn(eq_a, ids)
        self.assertIn(eq_b, ids)
        self.assertNotIn(eq_c, ids)
        self.assertEqual(self.client.get(f"/api/equipment/{eq_c}/").status_code, 404)
