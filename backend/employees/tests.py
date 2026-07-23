import io
import tempfile

from accounts.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from equipment.models import Equipment, EquipmentType
from PIL import Image
from rest_framework.test import APITestCase

from storage import backends as storage_backends

from locations.models import Building, Place, Room

from .models import AccessPass, Employee, SimCard

_TEST_MEDIA_ROOT = tempfile.mkdtemp(prefix="ele-employee-tests-")


def _reset_local_backend():
    storage_backends._INSTANCES.pop("local", None)


def _make_png(width: int, height: int) -> SimpleUploadedFile:
    buf = io.BytesIO()
    Image.new("RGB", (width, height), color="white").save(buf, format="PNG")
    buf.seek(0)
    return SimpleUploadedFile("avatar.png", buf.read(), content_type="image/png")


class EmployeeDeleteGuardTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=self.admin)

    def test_delete_blocked_while_equipment_attached(self):
        employee = Employee.objects.create(first_name="Иван", last_name="Прозоров")
        eq_type = EquipmentType.objects.create(name="ПК")
        Equipment.objects.create(inventory_number="PC-1", equipment_type=eq_type, employee=employee)

        resp = self.client.delete(f"/api/employees/{employee.id}/")
        self.assertEqual(resp.status_code, 409)
        self.assertTrue(Employee.objects.filter(pk=employee.id).exists())

    def test_delete_succeeds_without_equipment(self):
        employee = Employee.objects.create(first_name="Иван", last_name="Прозоров")
        resp = self.client.delete(f"/api/employees/{employee.id}/")
        self.assertEqual(resp.status_code, 204)
        self.assertFalse(Employee.objects.filter(pk=employee.id).exists())


class EmployeeTerminateTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=self.admin)
        self.employee = Employee.objects.create(first_name="Иван", last_name="Прозоров")
        self.eq_type = EquipmentType.objects.create(name="ПК")
        self.eq1 = Equipment.objects.create(inventory_number="PC-1", equipment_type=self.eq_type, employee=self.employee)
        self.eq2 = Equipment.objects.create(inventory_number="PC-2", equipment_type=self.eq_type, employee=self.employee)
        # B26: увольнение перемещает имущество на склад — он обязателен.
        b = Building.objects.create(name="Здание")
        r = Room.objects.create(building=b, name="Комн.")
        self.store = Place.objects.create(room=r, name="Склад", place_type=Place.PlaceType.STORAGE)
        self.eq_actions = {
            str(self.eq1.id): {"storage_place": self.store.id},
            str(self.eq2.id): {"storage_place": self.store.id},
        }

    def _terminate(self, **extra):
        return self.client.post(
            f"/api/employees/{self.employee.id}/terminate/",
            {"equipment_actions": self.eq_actions, **extra},
            format="json",
        )

    def test_terminate_detaches_all_equipment(self):
        resp = self._terminate()
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data["detached_equipment_count"], 2)
        self.employee.refresh_from_db()
        self.assertFalse(self.employee.is_employed)
        self.eq1.refresh_from_db()
        self.eq2.refresh_from_db()
        # Оборудование откреплено и переехало на указанный склад.
        self.assertIsNone(self.eq1.employee)
        self.assertIsNone(self.eq2.employee)
        self.assertEqual(self.eq1.place_id, self.store.id)
        self.assertEqual(self.eq2.place_id, self.store.id)

    def test_terminate_requires_storage_for_equipment(self):
        # Без склада назначения увольнение отклоняется, сотрудник не уволен.
        resp = self.client.post(f"/api/employees/{self.employee.id}/terminate/", format="json")
        self.assertEqual(resp.status_code, 400, resp.data)
        self.employee.refresh_from_db()
        self.assertTrue(self.employee.is_employed)
        self.eq1.refresh_from_db()
        self.assertEqual(self.eq1.employee_id, self.employee.id)

    def test_terminate_with_linked_user_deactivation(self):
        user = User.objects.create_user(email="worker@example.com", password="Str0ng!Pass1", employee=self.employee)
        resp = self._terminate(deactivate_user=True)
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertTrue(resp.data["deactivated_user"])
        user.refresh_from_db()
        self.assertFalse(user.is_active)

    def test_terminate_without_deactivation_keeps_user_active(self):
        user = User.objects.create_user(email="worker@example.com", password="Str0ng!Pass1", employee=self.employee)
        resp = self._terminate()
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertFalse(resp.data["deactivated_user"])
        user.refresh_from_db()
        self.assertTrue(user.is_active)

    def test_terminate_detaches_sim_cards(self):
        # SIM — переиспользуемые объекты: при увольнении отвязываются
        # (деактивируются) и переезжают на указанный склад.
        sim1 = SimCard.objects.create(employee=self.employee, phone_number="+79001112233")
        sim2 = SimCard.objects.create(employee=self.employee, phone_number="+79004445566")
        resp = self._terminate(sim_actions={
            str(sim1.id): {"action": "detach", "storage_place": self.store.id},
            str(sim2.id): {"action": "detach", "storage_place": self.store.id},
        })
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data["deactivated_sim_count"], 2)
        for sim in (sim1, sim2):
            sim.refresh_from_db()
            self.assertTrue(sim.is_deactivated)
            self.assertIsNone(sim.employee_id)
            self.assertEqual(sim.storage_place_id, self.store.id)

    def test_restore_marks_employed_again(self):
        self._terminate()
        resp = self.client.post(f"/api/employees/{self.employee.id}/restore/", format="json")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.employee.refresh_from_db()
        self.assertTrue(self.employee.is_employed)


class SimCardTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=self.admin)
        self.employee = Employee.objects.create(first_name="Иван", last_name="Прозоров")

    def test_create_sim_card(self):
        resp = self.client.post(
            "/api/sim-cards/",
            {
                "employee": self.employee.id,
                "sim_type": "esim",
                "phone_number": "+79001112233",
                "network_operator": "МТС",
                "provider": "Тинькофф Мобайл",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data["sim_type_display"], "E-SIM")
        self.assertFalse(resp.data["is_deactivated"])

    def test_blank_phone_number_rejected(self):
        resp = self.client.post(
            "/api/sim-cards/",
            {"employee": self.employee.id, "phone_number": "   "},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_duplicate_phone_number_rejected(self):
        SimCard.objects.create(phone_number="+79001112233")
        resp = self.client.post(
            "/api/sim-cards/", {"phone_number": "+79001112233"}, format="json"
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("phone_number", resp.data["errors"])

    def test_detach_then_attach(self):
        from locations.models import Building, Place, Room

        b = Building.objects.create(name="Главное")
        r = Room.objects.create(building=b, name="101")
        store = Place.objects.create(room=r, name="Склад", place_type=Place.PlaceType.STORAGE)
        sim = SimCard.objects.create(employee=self.employee, phone_number="+79001112233")
        # Открепление требует место хранения (B8).
        resp = self.client.post(f"/api/sim-cards/{sim.id}/detach/", {"storage_place": store.id}, format="json")
        self.assertEqual(resp.status_code, 200, resp.data)
        sim.refresh_from_db()
        self.assertTrue(sim.is_deactivated)
        self.assertIsNone(sim.employee_id)
        self.assertEqual(sim.storage_place_id, store.id)

        other = Employee.objects.create(first_name="Пётр", last_name="Сидоров")
        resp = self.client.post(
            f"/api/sim-cards/{sim.id}/attach/", {"employee": other.id}, format="json"
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        sim.refresh_from_db()
        self.assertFalse(sim.is_deactivated)
        self.assertEqual(sim.employee_id, other.id)

    def test_tab_filters_active_and_deactivated(self):
        SimCard.objects.create(employee=self.employee, phone_number="+79001112233")
        SimCard.objects.create(phone_number="+79004445566")  # свободна
        # Вкладка «Активные» — все неутилизированные (и привязанные, и свободные);
        # разделяет их фильтр status внутри вкладки (attached/free), см. ниже.
        active = self.client.get("/api/sim-cards/?tab=active")
        self.assertEqual(
            sorted(s["phone_number"] for s in active.data["results"]),
            ["+79001112233", "+79004445566"],
        )
        # Только за сотрудником — Размещение (assigned=employee, категория).
        attached = self.client.get("/api/sim-cards/?tab=active&assigned=employee")
        self.assertEqual([s["phone_number"] for s in attached.data["results"]], ["+79001112233"])
        # tab=deactivated — только свободные (без сотрудника, неутилизированные).
        deact = self.client.get("/api/sim-cards/?tab=deactivated")
        self.assertEqual([s["phone_number"] for s in deact.data["results"]], ["+79004445566"])

    def test_filter_by_employee(self):
        other = Employee.objects.create(first_name="Пётр", last_name="Сидоров")
        SimCard.objects.create(employee=self.employee, phone_number="+79001112233")
        SimCard.objects.create(employee=other, phone_number="+79004445566")
        resp = self.client.get(f"/api/sim-cards/?employee={self.employee.id}")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data["results"]), 1)
        self.assertEqual(resp.data["results"][0]["phone_number"], "+79001112233")

    def test_employee_card_shows_only_active(self):
        # Активная (привязана) видна в карточке; отвязанная (employee=NULL) — нет.
        SimCard.objects.create(employee=self.employee, phone_number="+79001112233")
        SimCard.objects.create(phone_number="+79004445566")
        resp = self.client.get(f"/api/employees/{self.employee.id}/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data["sim_cards"]), 1)

    def test_operators_and_providers_autocomplete(self):
        SimCard.objects.create(
            employee=self.employee, phone_number="+79001112233", network_operator="МТС", provider="Тинькофф Мобайл"
        )
        SimCard.objects.create(
            employee=self.employee, phone_number="+79004445566", network_operator="МТС", provider="Йота"
        )
        resp_op = self.client.get("/api/sim-cards/operators/")
        self.assertEqual(resp_op.data, ["МТС"])
        resp_pr = self.client.get("/api/sim-cards/providers/")
        self.assertEqual(sorted(resp_pr.data), ["Йота", "Тинькофф Мобайл"])


class SimCardAccessTests(APITestCase):
    """Сотрудник видит свои номера (read-only), Наблюдатель — все; управление
    и автоподсказки — только admin/accountant."""

    def setUp(self):
        self.emp = Employee.objects.create(first_name="Иван", last_name="Прозоров")
        self.other = Employee.objects.create(first_name="Пётр", last_name="Сидоров")
        self.my_sim = SimCard.objects.create(employee=self.emp, phone_number="+79001112233")
        self.other_sim = SimCard.objects.create(employee=self.other, phone_number="+79004445566")
        self.emp_user = User.objects.create_user(
            email="ivan@example.com", password="Str0ng!Pass1", employee=self.emp
        )

    def test_employee_sees_only_own_even_with_foreign_param(self):
        self.client.force_authenticate(user=self.emp_user)
        resp = self.client.get(f"/api/sim-cards/?employee={self.other.id}")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual([s["phone_number"] for s in resp.data["results"]], ["+79001112233"])

    def test_employee_cannot_retrieve_foreign_sim(self):
        self.client.force_authenticate(user=self.emp_user)
        resp = self.client.get(f"/api/sim-cards/{self.other_sim.id}/")
        self.assertEqual(resp.status_code, 404)

    def test_employee_cannot_create(self):
        self.client.force_authenticate(user=self.emp_user)
        resp = self.client.post(
            "/api/sim-cards/", {"employee": self.emp.id, "phone_number": "+70000000000"}, format="json"
        )
        self.assertEqual(resp.status_code, 403)

    def test_employee_cannot_detach(self):
        self.client.force_authenticate(user=self.emp_user)
        resp = self.client.post(f"/api/sim-cards/{self.my_sim.id}/detach/", format="json")
        self.assertEqual(resp.status_code, 403)

    def test_employee_cannot_use_autocomplete(self):
        self.client.force_authenticate(user=self.emp_user)
        self.assertEqual(self.client.get("/api/sim-cards/operators/").status_code, 403)
        self.assertEqual(self.client.get("/api/sim-cards/providers/").status_code, 403)

    def test_observer_sees_all_sim(self):
        # «Наблюдатель» видит раздел «Корпоративная связь» целиком (все номера),
        # а не только свои — но строго на просмотр.
        self.emp_user.is_observer = True
        self.emp_user.save(update_fields=["is_observer"])
        self.client.force_authenticate(user=self.emp_user)
        resp = self.client.get("/api/sim-cards/?tab=active")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(
            sorted(s["phone_number"] for s in resp.data["results"]),
            ["+79001112233", "+79004445566"],
        )

    def test_observer_can_retrieve_foreign_sim(self):
        self.emp_user.is_observer = True
        self.emp_user.save(update_fields=["is_observer"])
        self.client.force_authenticate(user=self.emp_user)
        resp = self.client.get(f"/api/sim-cards/{self.other_sim.id}/")
        self.assertEqual(resp.status_code, 200)

    def test_observer_cannot_create_sim(self):
        # Просмотр — да, но никаких действий: создание запрещено.
        self.emp_user.is_observer = True
        self.emp_user.save(update_fields=["is_observer"])
        self.client.force_authenticate(user=self.emp_user)
        resp = self.client.post(
            "/api/sim-cards/", {"employee": self.emp.id, "phone_number": "+70000000000"}, format="json"
        )
        self.assertEqual(resp.status_code, 403)

    def test_unlinked_employee_sees_nothing(self):
        orphan = User.objects.create_user(email="orphan@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=orphan)
        resp = self.client.get("/api/sim-cards/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data["results"]), 0)


class AccessPassTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=self.admin)
        self.employee = Employee.objects.create(first_name="Иван", last_name="Прозоров")
        # Объект доступа выбирается только с флагом «Требуется ключ/пропуск» (B15).
        self.building = Building.objects.create(name="Главный офис", requires_pass=True)

    def _create(self, **extra):
        payload = {"building_ids": [self.building.id], **extra}
        return self.client.post("/api/access-passes/", payload, format="json")

    def test_create_with_account_and_types(self):
        resp = self._create(
            employee=self.employee.id, account_number="A-100",
            type_vehicle=True, type_pedestrian=True,
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data["account_number"], "A-100")
        self.assertTrue(resp.data["type_vehicle"])
        self.assertTrue(resp.data["type_pedestrian"])
        self.assertFalse(resp.data["is_deactivated"])

    def test_multiple_passes_without_account_number_allowed(self):
        self.assertEqual(self._create().status_code, 201)
        self.assertEqual(self._create().status_code, 201)

    def test_duplicate_account_number_rejected(self):
        self.assertEqual(self._create(account_number="A-1").status_code, 201)
        resp = self._create(account_number="A-1")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("account_number", resp.data["errors"])

    def test_same_account_number_allowed_across_object_types(self):
        # Пропуск и ключ имеют независимые пространства учётных номеров (B1):
        # один и тот же номер можно завести и у пропуска, и у ключа.
        self.assertEqual(self._create(account_number="N-7").status_code, 201)
        key = self._create(object_type="key", account_number="N-7")
        self.assertEqual(key.status_code, 201, key.data)
        # Но два ключа с одним номером — по-прежнему нельзя.
        dup = self._create(object_type="key", account_number="N-7")
        self.assertEqual(dup.status_code, 400)
        self.assertIn("account_number", dup.data["errors"])

    def test_detach_then_attach(self):
        from locations.models import Place, Room

        r = Room.objects.create(building=self.building, name="101")
        store = Place.objects.create(room=r, name="Склад", place_type=Place.PlaceType.STORAGE)
        created = self._create(employee=self.employee.id)
        pass_id = created.data["id"]
        # Открепление требует место хранения (B8).
        resp = self.client.post(
            f"/api/access-passes/{pass_id}/detach/", {"storage_place": store.id}, format="json"
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertTrue(resp.data["is_deactivated"])
        resp = self.client.post(
            f"/api/access-passes/{pass_id}/attach/", {"employee": self.employee.id}, format="json"
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertFalse(resp.data["is_deactivated"])


@override_settings(MEDIA_ROOT=_TEST_MEDIA_ROOT)
class EmployeeAvatarUploadTests(APITestCase):
    """Аватар — не более 600×600px, не более 2 МБ; грузит Admin/
    Accountant из карточки, либо сам сотрудник из своего Профиля."""

    def setUp(self):
        _reset_local_backend()
        self.admin = User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")
        self.employee = Employee.objects.create(first_name="Иван", last_name="Прозоров")

    def test_admin_uploads_avatar(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(
            f"/api/employees/{self.employee.id}/avatar/",
            {"file": _make_png(200, 200)},
            format="multipart",
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertIsNotNone(resp.data["avatar"])
        self.assertTrue(resp.data["avatar"]["url"])

    def test_oversized_dimensions_rejected(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(
            f"/api/employees/{self.employee.id}/avatar/",
            {"file": _make_png(900, 900)},
            format="multipart",
        )
        self.assertEqual(resp.status_code, 400)

    def test_stranger_employee_cannot_upload_for_another(self):
        other = Employee.objects.create(first_name="Пётр", last_name="Сидоров")
        worker_user = User.objects.create_user(
            email="worker@example.com", password="Str0ng!Pass1", employee=other
        )
        self.client.force_authenticate(user=worker_user)
        resp = self.client.post(
            f"/api/employees/{self.employee.id}/avatar/",
            {"file": _make_png(200, 200)},
            format="multipart",
        )
        self.assertEqual(resp.status_code, 403)

    def test_own_employee_can_upload_from_profile(self):
        worker_user = User.objects.create_user(
            email="worker@example.com", password="Str0ng!Pass1", employee=self.employee
        )
        self.client.force_authenticate(user=worker_user)
        resp = self.client.post(
            f"/api/employees/{self.employee.id}/avatar/",
            {"file": _make_png(200, 200)},
            format="multipart",
        )
        self.assertEqual(resp.status_code, 200, resp.data)

    def test_delete_avatar(self):
        self.client.force_authenticate(user=self.admin)
        self.client.post(
            f"/api/employees/{self.employee.id}/avatar/",
            {"file": _make_png(200, 200)},
            format="multipart",
        )
        resp = self.client.delete(f"/api/employees/{self.employee.id}/avatar/")
        self.assertEqual(resp.status_code, 204)
        self.employee.refresh_from_db()
        self.assertIsNone(self.employee.avatar)


class DepartmentsAutocompleteTests(APITestCase):
    def test_distinct_departments(self):
        admin = User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=admin)
        Employee.objects.create(first_name="А", last_name="Б", department="IT")
        Employee.objects.create(first_name="В", last_name="Г", department="IT")
        Employee.objects.create(first_name="Д", last_name="Е", department="Бухгалтерия")
        resp = self.client.get("/api/employees/departments/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(sorted(resp.data), ["IT", "Бухгалтерия"])


class EmployeeSearchTests(APITestCase):
    """Поиск Сотрудников: Фамилия, Имя, Должность, Отдел."""

    def setUp(self):
        self.admin = User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=self.admin)
        self.e1 = Employee.objects.create(
            first_name="Анастасия", last_name="Стратиенко", position="Бухгалтер", department="Финансы"
        )
        self.e2 = Employee.objects.create(
            first_name="Сергей", last_name="Виноградов", position="Водитель", department="Логистика"
        )

    def _search_ids(self, term):
        resp = self.client.get("/api/employees/", {"search": term})
        self.assertEqual(resp.status_code, 200, resp.data)
        return {row["id"] for row in resp.data["results"]}

    def test_search_by_first_name(self):
        self.assertEqual(self._search_ids("Анастасия"), {self.e1.id})

    def test_search_by_last_name(self):
        self.assertEqual(self._search_ids("Виноградов"), {self.e2.id})

    def test_search_by_position(self):
        self.assertEqual(self._search_ids("Водитель"), {self.e2.id})

    def test_search_by_department(self):
        self.assertEqual(self._search_ids("Логистика"), {self.e2.id})


class SimSearchTests(APITestCase):
    """Поиск SIM: Номер, Поставщик, Оператор, Тип, Место хранения, Сотрудник
    (Фамилия/Имя/Должность/Отдел), Оборудование (Тип/Модель/Учётный номер)."""

    def setUp(self):
        from equipment.models import EquipmentFieldValue

        self.admin = User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=self.admin)
        self.emp = Employee.objects.create(
            first_name="Пётр", last_name="Кузнецов", position="Инженер", department="Разработка"
        )
        room = Room.objects.create(building=Building.objects.create(name="ЦОД"), name="Стойка 7")
        storage = Place.objects.create(room=room, name="Склад SIM", place_type=Place.PlaceType.STORAGE)
        eq_type = EquipmentType.objects.create(name="Роутер", allows_sim=True)
        self.eq = Equipment.objects.create(inventory_number="RT-500", equipment_type=eq_type)
        EquipmentFieldValue.objects.create(
            equipment=self.eq, field=eq_type.fields.get(name="Модель"), value_text="MikroTik"
        )
        # За сотрудником / за оборудованием / на складе (свободная).
        self.s_emp = SimCard.objects.create(
            phone_number="+7-900-000-0001", provider="Мегафон", network_operator="MegaFon",
            employee=self.emp,
        )
        self.s_eq = SimCard.objects.create(phone_number="+7-900-000-0002", equipment=self.eq)
        self.s_free = SimCard.objects.create(
            phone_number="+7-900-000-0003", sim_type=SimCard.SimType.ESIM, storage_place=storage,
        )

    def _search_ids(self, term):
        resp = self.client.get("/api/sim-cards/", {"search": term})
        self.assertEqual(resp.status_code, 200, resp.data)
        return {row["id"] for row in resp.data["results"]}

    def test_search_by_phone_number(self):
        self.assertEqual(self._search_ids("0001"), {self.s_emp.id})

    def test_search_by_provider(self):
        self.assertEqual(self._search_ids("Мегафон"), {self.s_emp.id})

    def test_search_by_type_esim(self):
        self.assertEqual(self._search_ids("esim"), {self.s_free.id})

    def test_search_by_type_esim_with_hyphen(self):
        # Пользователь вводит отображаемую метку «E-SIM» (с дефисом).
        self.assertEqual(self._search_ids("E-SIM"), {self.s_free.id})

    def test_search_by_storage_place_name(self):
        self.assertEqual(self._search_ids("Склад SIM"), {self.s_free.id})

    def test_search_by_employee_last_name(self):
        self.assertEqual(self._search_ids("Кузнецов"), {self.s_emp.id})

    def test_search_by_employee_department(self):
        self.assertEqual(self._search_ids("Разработка"), {self.s_emp.id})

    def test_search_by_equipment_type(self):
        self.assertEqual(self._search_ids("Роутер"), {self.s_eq.id})

    def test_search_by_equipment_model(self):
        self.assertEqual(self._search_ids("MikroTik"), {self.s_eq.id})

    def test_search_by_equipment_inventory_number(self):
        self.assertEqual(self._search_ids("RT-500"), {self.s_eq.id})


class AccessPassSearchTests(APITestCase):
    """Поиск средств доступа: Тип (Пропуск/Ключ), Учётный номер, Место
    хранения, Сотрудник (Фамилия/Имя/Должность/Отдел)."""

    def setUp(self):
        self.admin = User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=self.admin)
        self.emp = Employee.objects.create(
            first_name="Ольга", last_name="Соколова", position="Охранник", department="Безопасность"
        )
        room = Room.objects.create(building=Building.objects.create(name="Проходная"), name="Пост 1")
        storage = Place.objects.create(room=room, name="Хранилище карт", place_type=Place.PlaceType.STORAGE)
        self.p_emp = AccessPass.objects.create(
            object_type=AccessPass.ObjectType.PASS, account_number="PASS-77",
            type_vehicle=True, employee=self.emp,
        )
        self.p_key = AccessPass.objects.create(
            object_type=AccessPass.ObjectType.KEY, account_number="KEY-88", storage_place=storage,
        )

    def _search_ids(self, term):
        resp = self.client.get("/api/access-passes/", {"search": term, "tab": "active"})
        self.assertEqual(resp.status_code, 200, resp.data)
        return {row["id"] for row in resp.data["results"]}

    def test_search_by_account_number(self):
        self.assertEqual(self._search_ids("PASS-77"), {self.p_emp.id})

    def test_search_by_type_key(self):
        self.assertEqual(self._search_ids("ключ"), {self.p_key.id})

    def test_search_by_type_pass(self):
        self.assertEqual(self._search_ids("пропуск"), {self.p_emp.id})

    def test_search_by_type_pass_partial(self):
        # Неполный ввод «проп» тоже должен находить пропуска (префиксное совпадение).
        self.assertEqual(self._search_ids("проп"), {self.p_emp.id})

    def test_search_by_storage_place_name(self):
        self.assertEqual(self._search_ids("Хранилище карт"), {self.p_key.id})

    def test_search_by_employee_last_name(self):
        self.assertEqual(self._search_ids("Соколова"), {self.p_emp.id})

    def test_search_by_employee_position(self):
        self.assertEqual(self._search_ids("Охранник"), {self.p_emp.id})


class SimEquipmentPlacementTests(APITestCase):
    """B8 — SIM за оборудованием + открепление на склад."""

    def setUp(self):
        self.admin = User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=self.admin)
        from equipment.models import EquipmentType, Equipment
        from locations.models import Building, Place, Room

        b = Building.objects.create(name="Главное")
        r = Room.objects.create(building=b, name="101")
        self.store = Place.objects.create(room=r, name="Склад", place_type=Place.PlaceType.STORAGE)
        # B17: SIM можно ставить только в тип с флагом.
        et = EquipmentType.objects.create(name="Модем", allows_sim=True)
        self.eq = Equipment.objects.create(inventory_number="M-1", equipment_type=et)

    def test_attach_to_equipment_then_detach_to_storage(self):
        sim = SimCard.objects.create(phone_number="+79001112233")
        r = self.client.post(
            f"/api/sim-cards/{sim.id}/attach/", {"mode": "equipment", "equipment": self.eq.id}, format="json"
        )
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data["equipment"], self.eq.id)
        self.assertFalse(r.data["is_deactivated"])
        # Открепление требует склад.
        r = self.client.post(f"/api/sim-cards/{sim.id}/detach/", {}, format="json")
        self.assertEqual(r.status_code, 400, r.data)
        r = self.client.post(f"/api/sim-cards/{sim.id}/detach/", {"storage_place": self.store.id}, format="json")
        self.assertEqual(r.status_code, 200, r.data)
        self.assertIsNone(r.data["equipment"])
        self.assertTrue(r.data["is_deactivated"])

    def test_attach_rejected_when_type_disallows_sim(self):
        from equipment.models import Equipment, EquipmentType

        et = EquipmentType.objects.create(name="Тумба", allows_sim=False)
        eq = Equipment.objects.create(inventory_number="T-1", equipment_type=et)
        sim = SimCard.objects.create(phone_number="+79005556677")
        r = self.client.post(
            f"/api/sim-cards/{sim.id}/attach/", {"mode": "equipment", "equipment": eq.id}, format="json"
        )
        self.assertEqual(r.status_code, 400, r.data)


class EsimNoStorageTests(APITestCase):
    """B8 — E-SIM виртуальна: открепление без места хранения."""

    def setUp(self):
        self.admin = User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=self.admin)
        self.emp = Employee.objects.create(first_name="Иван", last_name="Иванов")

    def test_esim_detach_without_storage(self):
        sim = SimCard.objects.create(employee=self.emp, phone_number="+79001112233", sim_type="esim")
        r = self.client.post(f"/api/sim-cards/{sim.id}/detach/", {}, format="json")
        self.assertEqual(r.status_code, 200, r.data)
        sim.refresh_from_db()
        self.assertIsNone(sim.employee_id)
        self.assertIsNone(sim.storage_place_id)
        self.assertTrue(sim.is_deactivated)

    def test_physical_sim_detach_requires_storage(self):
        sim = SimCard.objects.create(employee=self.emp, phone_number="+79004445566", sim_type="sim")
        r = self.client.post(f"/api/sim-cards/{sim.id}/detach/", {}, format="json")
        self.assertEqual(r.status_code, 400, r.data)


class MyWorkPlacementTests(APITestCase):
    """B8 — профиль сотрудника: свои инструменты и рабочие места с объектами."""

    def setUp(self):
        from equipment.models import Equipment, EquipmentType
        from locations.models import Building, Place, Room
        from tools.models import Tool, ToolAllocation

        self.emp = Employee.objects.create(first_name="Иван", last_name="Иванов")
        self.user = User.objects.create_user(email="worker@example.com", password="Str0ng!Pass1", employee=self.emp)
        self.client.force_authenticate(self.user)
        b = Building.objects.create(name="Главное")
        r = Room.objects.create(building=b, name="101")
        wp = Place.objects.create(room=r, name="РМ-1", place_type=Place.PlaceType.WORKPLACE)
        wp.employees.add(self.emp)
        et = EquipmentType.objects.create(name="ПК")
        Equipment.objects.create(inventory_number="I-1", equipment_type=et, place=wp)
        tool = Tool.objects.create(name="Отвёртка", quantity=5)
        ToolAllocation.objects.create(tool=tool, employee=self.emp, quantity=2)

    def test_returns_tools_and_workplaces(self):
        r = self.client.get("/api/my/work-placement/")
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(len(r.data["tools"]), 1)
        self.assertEqual(r.data["tools"][0]["quantity"], 2)
        self.assertEqual(len(r.data["workplaces"]), 1)
        self.assertEqual(len(r.data["workplaces"][0]["equipment"]), 1)

    def test_no_employee_returns_empty(self):
        other = User.objects.create_user(email="noemp@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(other)
        r = self.client.get("/api/my/work-placement/")
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data, {"tools": [], "workplaces": []})


class SimAndPassFilterTests(APITestCase):
    """B27. Новые фильтры списков SIM (тип/оператор) и пропусков (тип средства)."""

    def setUp(self):
        self.admin = User.objects.create_superuser(email="spfilt@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=self.admin)
        self.sim = SimCard.objects.create(phone_number="+79001112200", sim_type="sim", network_operator="МТС")
        self.esim = SimCard.objects.create(phone_number="+79001112201", sim_type="esim", network_operator="")
        self.key = AccessPass.objects.create(object_type="key", account_number="K-1")
        self.pass_ = AccessPass.objects.create(object_type="pass", account_number="P-1")

    def test_sim_type_filter(self):
        rows = self.client.get("/api/sim-cards/", {"tab": "active", "sim_type": "esim"}).data["results"]
        self.assertEqual({r["id"] for r in rows}, {self.esim.id})

    def test_sim_operator_and_none(self):
        rows = self.client.get("/api/sim-cards/", {"tab": "active", "operator": "МТС"}).data["results"]
        self.assertEqual({r["id"] for r in rows}, {self.sim.id})
        rows = self.client.get("/api/sim-cards/", {"tab": "active", "operator_none": "1"}).data["results"]
        self.assertEqual({r["id"] for r in rows}, {self.esim.id})

    def test_pass_object_type_filter(self):
        rows = self.client.get("/api/access-passes/", {"tab": "active", "object_type": "key"}).data["results"]
        self.assertEqual({r["id"] for r in rows}, {self.key.id})
        rows = self.client.get("/api/access-passes/", {"tab": "active", "object_type": "pass"}).data["results"]
        self.assertEqual({r["id"] for r in rows}, {self.pass_.id})


class SimOptionConstraintTests(APITestCase):
    """B27. Тип SIM ограничивает варианты оператора/поставщика; верхние фильтры
    ограничивают опции сотрудников/мест хранения."""

    def setUp(self):
        self.admin = User.objects.create_superuser(email="simopt@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=self.admin)
        self.emp_a = Employee.objects.create(first_name="A", last_name="A")
        self.emp_b = Employee.objects.create(first_name="B", last_name="B")
        SimCard.objects.create(employee=self.emp_a, phone_number="+70000000001", sim_type="sim", network_operator="МТС")
        SimCard.objects.create(employee=self.emp_b, phone_number="+70000000002", sim_type="esim", network_operator="Билайн")

    def test_operators_by_sim_type(self):
        self.assertEqual(list(self.client.get("/api/sim-cards/operators/", {"sim_type": "sim"}).data), ["МТС"])
        self.assertEqual(list(self.client.get("/api/sim-cards/operators/", {"sim_type": "esim"}).data), ["Билайн"])

    def test_employee_options_constrained_by_sim_filters(self):
        ids = {e["id"] for e in self.client.get("/api/employees/", {"has_sim": "1", "sim_type": "sim"}).data["results"]}
        self.assertIn(self.emp_a.id, ids)
        self.assertNotIn(self.emp_b.id, ids)
        ids = {e["id"] for e in self.client.get("/api/employees/", {"has_sim": "1", "operator": "Билайн"}).data["results"]}
        self.assertIn(self.emp_b.id, ids)
        self.assertNotIn(self.emp_a.id, ids)


class PassOptionConstraintTests(APITestCase):
    """B27. Тип средства ограничивает опции доступа (referenced-locations) и
    Размещения; доступ ограничивает опции Размещения (has_pass)."""

    def setUp(self):
        self.admin = User.objects.create_superuser(email="passopt@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=self.admin)
        self.emp_key = Employee.objects.create(first_name="K", last_name="K")
        self.emp_pass = Employee.objects.create(first_name="P", last_name="P")
        self.b1 = Building.objects.create(name="Здание1")
        self.b2 = Building.objects.create(name="Здание2")
        self.key = AccessPass.objects.create(object_type="key", account_number="K1", employee=self.emp_key)
        self.key.buildings.add(self.b1)
        self.pass_ = AccessPass.objects.create(object_type="pass", account_number="P1", employee=self.emp_pass)
        self.pass_.buildings.add(self.b2)

    def test_referenced_locations_by_object_type(self):
        data = self.client.get("/api/access-passes/referenced-locations/", {"object_type": "key"}).data
        self.assertEqual(set(data["buildings"]), {self.b1.id})
        data = self.client.get("/api/access-passes/referenced-locations/", {"object_type": "pass"}).data
        self.assertEqual(set(data["buildings"]), {self.b2.id})

    def test_employee_options_by_pass_object_type(self):
        ids = {e["id"] for e in self.client.get("/api/employees/", {"has_pass": "1", "object_type": "key"}).data["results"]}
        self.assertIn(self.emp_key.id, ids)
        self.assertNotIn(self.emp_pass.id, ids)

    def test_employee_options_by_pass_access_building(self):
        ids = {e["id"] for e in self.client.get("/api/employees/", {"has_pass": "1", "buildings": str(self.b2.id)}).data["results"]}
        self.assertIn(self.emp_pass.id, ids)
        self.assertNotIn(self.emp_key.id, ids)
