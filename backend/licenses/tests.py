import tempfile

from accounts.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from rest_framework.test import APITestCase
from storage import backends as storage_backends

from .models import License, LicenseType

_TEST_MEDIA_ROOT = tempfile.mkdtemp(prefix="ele-license-tests-")


def _reset_local_backend():
    storage_backends._INSTANCES.pop("local", None)


@override_settings(MEDIA_ROOT=_TEST_MEDIA_ROOT)
class LicenseFieldFileUploadTests(APITestCase):
    """Реквизит типа «файл» у Лицензии: не более 20 МБ на сервере."""

    def setUp(self):
        _reset_local_backend()
        self.admin = User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post("/api/license-types/", {"name": "С файлом"}, format="json")
        self.type_id = resp.data["id"]
        resp = self.client.post(
            f"/api/license-types/{self.type_id}/fields/",
            {"name": "Сертификат", "value_type": "file", "is_required": False},
            format="json",
        )
        self.field_id = resp.data["id"]
        self.license_obj = License.objects.create(name="Тест", license_type_id=self.type_id)

    def test_upload_rejects_file_over_20mb(self):
        oversized = SimpleUploadedFile("big.pdf", b"0" * (20 * 1024 * 1024 + 1), content_type="application/pdf")
        resp = self.client.post(
            f"/api/licenses/{self.license_obj.id}/field-values/{self.field_id}/file/",
            {"file": oversized},
            format="multipart",
        )
        self.assertEqual(resp.status_code, 400)

    def test_upload_accepts_small_file(self):
        resp = self.client.post(
            f"/api/licenses/{self.license_obj.id}/field-values/{self.field_id}/file/",
            {"file": SimpleUploadedFile("cert.pdf", b"fake cert", content_type="application/pdf")},
            format="multipart",
        )
        self.assertEqual(resp.status_code, 200, resp.data)


class LicenseKeyMaskingTests(APITestCase):
    """«Номер/ключ» не отображается ни в одном списковом представлении."""

    def setUp(self):
        self.admin = User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=self.admin)
        self.software = LicenseType.objects.create(name="Программная", kind="software")
        self.key_field = self.software.fields.get(is_locked=True)
        self.hardware = LicenseType.objects.create(name="Аппаратная", kind="hardware")
        self.token_field = self.hardware.fields.get(is_locked=True)

    def test_key_absent_from_list_present_in_detail(self):
        resp = self.client.post(
            "/api/licenses/",
            {
                "name": "КриптоПро CSP 5.0",
                "license_type": self.software.id,
                "field_values_input": [{"field": self.key_field.id, "value": "XXXX-YYYY-ZZZZ"}],
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        license_id = resp.data["id"]

        resp = self.client.get("/api/licenses/")
        self.assertNotIn("field_values", resp.data["results"][0])
        raw = str(resp.data)
        self.assertNotIn("XXXX-YYYY-ZZZZ", raw)

        resp = self.client.get(f"/api/licenses/{license_id}/")
        values = {fv["field"]: fv["value"] for fv in resp.data["field_values"]}
        self.assertEqual(values[self.key_field.id], "XXXX-YYYY-ZZZZ")

    def test_missing_required_key_blocks_creation(self):
        resp = self.client.post(
            "/api/licenses/", {"name": "Без ключа", "license_type": self.software.id}, format="json"
        )
        self.assertEqual(resp.status_code, 400)
        self.assertFalse(License.objects.filter(name="Без ключа").exists())

    def test_hardware_token_required_masked_and_unique(self):
        # Аналог «Номер/ключ» у Аппаратной: обязателен, маскируется в списке,
        # уникален.
        base = {"name": "Токен PKI", "license_type": self.hardware.id}
        # Без серийника — обязательный реквизит не заполнен.
        self.assertEqual(self.client.post("/api/licenses/", base, format="json").status_code, 400)

        payload = {**base, "field_values_input": [{"field": self.token_field.id, "value": "SN-777"}]}
        r1 = self.client.post("/api/licenses/", payload, format="json")
        self.assertEqual(r1.status_code, 201, r1.data)

        # В списке серийник не светится.
        listing = self.client.get("/api/licenses/")
        self.assertNotIn("SN-777", str(listing.data))

        # Дубликат серийника — отклонён.
        dup = self.client.post(
            "/api/licenses/",
            {"name": "Токен 2", "license_type": self.hardware.id, "field_values_input": [{"field": self.token_field.id, "value": "SN-777"}]},
            format="json",
        )
        self.assertEqual(dup.status_code, 400)
        self.assertIn("field_values", dup.data["errors"])

    def _create(self, name, key):
        return self.client.post(
            "/api/licenses/",
            {
                "name": name,
                "license_type": self.software.id,
                "field_values_input": [{"field": self.key_field.id, "value": key}],
            },
            format="json",
        )

    def test_duplicate_key_rejected(self):
        self.assertEqual(self._create("Лицензия A", "KEY-123").status_code, 201)
        resp = self._create("Лицензия B", "KEY-123")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("field_values", resp.data["errors"])
        self.assertFalse(License.objects.filter(name="Лицензия B").exists())

    def test_same_license_can_keep_its_key_on_update(self):
        created = self._create("Лицензия A", "KEY-123")
        license_id = created.data["id"]
        resp = self.client.patch(
            f"/api/licenses/{license_id}/",
            {"name": "Лицензия A (ред.)", "field_values_input": [{"field": self.key_field.id, "value": "KEY-123"}]},
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.data)


class LicenseTypeKindTests(APITestCase):
    """B18: вид типа + автосев ключевого реквизита + правила смены/удаления."""

    def setUp(self):
        self.admin = User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=self.admin)

    def test_create_software_type_seeds_key_field(self):
        resp = self.client.post("/api/license-types/", {"name": "Антивирус", "kind": "software"}, format="json")
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data["kind"], "software")
        locked = [f for f in resp.data["fields"] if f["is_locked"]]
        self.assertEqual(len(locked), 1)
        self.assertEqual(locked[0]["name"], "Номер/ключ")

    def test_create_hardware_type_seeds_token_field(self):
        resp = self.client.post("/api/license-types/", {"name": "Токен", "kind": "hardware"}, format="json")
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data["kind"], "hardware")
        locked = [f for f in resp.data["fields"] if f["is_locked"]]
        self.assertEqual(locked[0]["name"], "Номер/ID/Serial токена")

    def test_kind_cannot_change_after_creation(self):
        t = LicenseType.objects.create(name="Офис", kind="software")
        resp = self.client.patch(f"/api/license-types/{t.id}/", {"kind": "hardware"}, format="json")
        self.assertEqual(resp.status_code, 400)

    def test_cannot_delete_type_with_objects(self):
        t = LicenseType.objects.create(name="Антивирус", kind="software")
        License.objects.create(license_type=t)
        resp = self.client.delete(f"/api/license-types/{t.id}/")
        self.assertEqual(resp.status_code, 409)

    def test_can_delete_empty_type(self):
        t = LicenseType.objects.create(name="Пустой", kind="software")
        resp = self.client.delete(f"/api/license-types/{t.id}/")
        self.assertEqual(resp.status_code, 204)

    def test_cannot_delete_locked_key_field(self):
        t = LicenseType.objects.create(name="Антивирус", kind="software")
        key_field = t.fields.get(is_locked=True)
        resp = self.client.delete(f"/api/license-types/{t.id}/fields/{key_field.id}/")
        self.assertEqual(resp.status_code, 409)

    def test_soft_type_change_same_kind_ok(self):
        soft_a = LicenseType.objects.create(name="Антивирус", kind="software")
        soft_b = LicenseType.objects.create(name="Офис", kind="software")
        key_b = soft_b.fields.get(is_locked=True)
        lic = License.objects.create(license_type=soft_a)
        ok = self.client.patch(
            f"/api/licenses/{lic.id}/",
            {"license_type": soft_b.id, "field_values_input": [{"field": key_b.id, "value": "K-1"}]},
            format="json",
        )
        self.assertEqual(ok.status_code, 200, ok.data)
        lic.refresh_from_db()
        self.assertEqual(lic.license_type_id, soft_b.id)

    def test_soft_type_change_removes_stale_field_values(self):
        # При смене типа значения реквизитов прежнего типа не должны оставаться
        # (иначе на карточке два «Номер/ключ»).
        soft_a = LicenseType.objects.create(name="Антивирус", kind="software")
        soft_b = LicenseType.objects.create(name="Офис", kind="software")
        key_a = soft_a.fields.get(is_locked=True)
        key_b = soft_b.fields.get(is_locked=True)
        created = self.client.post(
            "/api/licenses/",
            {"license_type": soft_a.id, "field_values_input": [{"field": key_a.id, "value": "AAA"}]},
            format="json",
        )
        self.assertEqual(created.status_code, 201, created.data)
        lic_id = created.data["id"]
        resp = self.client.patch(
            f"/api/licenses/{lic_id}/",
            {"license_type": soft_b.id, "field_values_input": [{"field": key_b.id, "value": "BBB"}]},
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        # Осталось ровно одно значение — от нового типа.
        card = self.client.get(f"/api/licenses/{lic_id}/")
        field_ids = {fv["field"] for fv in card.data["field_values"]}
        self.assertEqual(field_ids, {key_b.id})

    def test_history_hides_requisites_of_deleted_type(self):
        # Лицензия переведена со старого типа на новый, старый тип удалён —
        # его реквизиты (в т.ч. бывший «Номер/ключ») в истории не показываются
        # и не светятся открытым текстом.
        a = LicenseType.objects.create(name="Программная", kind="software")
        b = LicenseType.objects.create(name="Клиентская", kind="software")
        key_a = a.fields.get(is_locked=True)
        key_b = b.fields.get(is_locked=True)
        created = self.client.post(
            "/api/licenses/",
            {"license_type": a.id, "field_values_input": [{"field": key_a.id, "value": "OLD-SECRET-KEY"}]},
            format="json",
        )
        self.assertEqual(created.status_code, 201, created.data)
        lic_id = created.data["id"]
        moved = self.client.patch(
            f"/api/licenses/{lic_id}/",
            {"license_type": b.id, "field_values_input": [{"field": key_b.id, "value": "NEW-KEY"}]},
            format="json",
        )
        self.assertEqual(moved.status_code, 200, moved.data)
        # Старый тип освободился — удаляем его.
        self.assertEqual(self.client.delete(f"/api/license-types/{a.id}/").status_code, 204)
        rows = self.client.get(f"/api/licenses/{lic_id}/history/").data
        self.assertNotIn("OLD-SECRET-KEY", str(rows))

    def test_soft_type_change_cross_kind_rejected(self):
        soft = LicenseType.objects.create(name="Антивирус", kind="software")
        hard = LicenseType.objects.create(name="Токен", kind="hardware")
        lic = License.objects.create(license_type=soft)
        resp = self.client.patch(f"/api/licenses/{lic.id}/", {"license_type": hard.id}, format="json")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("license_type", resp.data["errors"])


class LicenseUtilizeTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=self.admin)
        self.hardware = LicenseType.objects.create(name="Аппаратная", kind="hardware")

    def test_utilize_detaches_and_archives(self):
        from equipment.models import Equipment, EquipmentType

        eq_type = EquipmentType.objects.create(name="Сервер", allows_license=True)
        equipment = Equipment.objects.create(inventory_number="SRV-1", equipment_type=eq_type)
        license_obj = License.objects.create(name="USB-ключ", license_type=self.hardware, equipment=equipment)

        resp = self.client.post(f"/api/licenses/{license_obj.id}/utilize/")
        self.assertEqual(resp.status_code, 200, resp.data)
        license_obj.refresh_from_db()
        self.assertTrue(license_obj.is_retired)
        self.assertIsNotNone(license_obj.retired_at)
        self.assertIsNone(license_obj.equipment)

        # Утилизированные — только во вкладке "Архив".
        resp = self.client.get("/api/licenses/?tab=active")
        self.assertNotIn(license_obj.id, [row["id"] for row in resp.data["results"]])
        resp = self.client.get("/api/licenses/?tab=archive")
        archived_row = next(row for row in resp.data["results"] if row["id"] == license_obj.id)
        self.assertIsNotNone(archived_row["retired_at"])


class LicenseSearchTests(APITestCase):
    """Поиск по списку Лицензий: Наименование, Тип, привязанное Оборудование
    (Тип, Модель, Учётный номер) и Название места хранения."""

    def setUp(self):
        from equipment.models import Equipment, EquipmentFieldValue, EquipmentType
        from locations.models import Building, Place, Room

        self.admin = User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=self.admin)
        self.type_a = LicenseType.objects.create(name="Антивирус", kind=LicenseType.Kind.SOFTWARE)
        self.type_b = LicenseType.objects.create(name="Офис", kind=LicenseType.Kind.HARDWARE)
        eq_type = EquipmentType.objects.create(name="Моноблок", allows_license=True)
        self.eq = Equipment.objects.create(inventory_number="DESKTOP-42", equipment_type=eq_type)
        # «Модель» — базовый is_locked-реквизит Типа (создаётся в save()).
        model_field = eq_type.fields.get(name="Модель")
        EquipmentFieldValue.objects.create(equipment=self.eq, field=model_field, value_text="iMac 27")

        room = Room.objects.create(building=Building.objects.create(name="Офис"), name="Каб. 1")
        storage = Place.objects.create(room=room, name="Склад лицензий", place_type=Place.PlaceType.STORAGE)
        self.lic1 = License.objects.create(name="Kaspersky", license_type=self.type_a, equipment=self.eq)
        self.lic2 = License.objects.create(name="Microsoft 365", license_type=self.type_b, storage_place=storage)

    def _search_ids(self, term):
        resp = self.client.get("/api/licenses/", {"search": term})
        self.assertEqual(resp.status_code, 200, resp.data)
        return {row["id"] for row in resp.data["results"]}

    def test_search_by_name(self):
        self.assertEqual(self._search_ids("Kaspersky"), {self.lic1.id})

    def test_search_by_type(self):
        self.assertEqual(self._search_ids("Офис"), {self.lic2.id})

    def test_search_by_kind_software(self):
        self.assertEqual(self._search_ids("Программная"), {self.lic1.id})

    def test_search_by_kind_hardware(self):
        # lic2 (тип «Офис») — аппаратная; неполный ввод «Аппарат» тоже находит.
        self.assertEqual(self._search_ids("Аппарат"), {self.lic2.id})

    def test_search_by_equipment_inventory_number(self):
        self.assertEqual(self._search_ids("DESKTOP-42"), {self.lic1.id})

    def test_search_by_equipment_type(self):
        self.assertEqual(self._search_ids("Моноблок"), {self.lic1.id})

    def test_search_by_equipment_model(self):
        self.assertEqual(self._search_ids("iMac"), {self.lic1.id})

    def test_search_by_storage_place_name(self):
        self.assertEqual(self._search_ids("Склад лицензий"), {self.lic2.id})

    def test_list_exposes_storage_place_detail(self):
        # Свободная лицензия на складе — в списке отдаётся место хранения
        # (название + здание/помещение), чтобы показать «На складе: …».
        resp = self.client.get("/api/licenses/", {"tab": "active", "status": "free"})
        row = next(r for r in resp.data["results"] if r["id"] == self.lic2.id)
        self.assertIsNotNone(row["storage_place_detail"])
        self.assertEqual(row["storage_place_detail"]["name"], "Склад лицензий")
        self.assertEqual(row["storage_place_detail"]["building_name"], "Офис")


class LicenseKeyExposureTests(APITestCase):
    """«Номер/ключ» отдаётся в списке только по ?include_key=1 и на карточке
    Оборудования только Admin/Accountant; в обычном списке отсутствует."""

    def setUp(self):
        from equipment.models import Equipment, EquipmentType

        self.admin = User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=self.admin)
        self.soft_type = LicenseType.objects.create(name="Программная", kind="software")
        self.key_field = self.soft_type.fields.get(name="Номер/ключ")
        eq_type = EquipmentType.objects.create(name="ПК", allows_license=True)
        self.eq = Equipment.objects.create(inventory_number="PC-1", equipment_type=eq_type)
        resp = self.client.post(
            "/api/licenses/",
            {
                "name": "Windows 11",
                "license_type": self.soft_type.id,
                "equipment": self.eq.id,
                "field_values_input": [{"field": self.key_field.id, "value": "AAAA-BBBB-CCCC"}],
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        self.lic_id = resp.data["id"]

    def test_key_absent_in_plain_list(self):
        resp = self.client.get("/api/licenses/")
        row = next(r for r in resp.data["results"] if r["id"] == self.lic_id)
        self.assertIsNone(row.get("key"))

    def test_key_present_with_include_key(self):
        resp = self.client.get("/api/licenses/?include_key=1")
        row = next(r for r in resp.data["results"] if r["id"] == self.lic_id)
        self.assertEqual(row["key"], "AAAA-BBBB-CCCC")

    def test_key_searchable_via_include_key(self):
        # Модалка привязки лицензии ищет по ключу на клиенте — ключ должен
        # приходить в выдаче.
        resp = self.client.get("/api/licenses/?include_key=1&search=Windows")
        row = next(r for r in resp.data["results"] if r["id"] == self.lic_id)
        self.assertEqual(row["key"], "AAAA-BBBB-CCCC")

    def test_key_on_equipment_card_for_admin(self):
        resp = self.client.get(f"/api/equipment/{self.eq.id}/")
        self.assertEqual(resp.data["licenses"][0]["key"], "AAAA-BBBB-CCCC")

    def test_key_hidden_from_employee_on_equipment_card(self):
        from employees.models import Employee

        emp = Employee.objects.create(first_name="И", last_name="И")
        self.eq.employee = emp
        self.eq.save(update_fields=["employee"])
        worker = User.objects.create_user(email="w@example.com", password="Str0ng!Pass1", employee=emp)
        self.client.force_authenticate(user=worker)
        resp = self.client.get(f"/api/equipment/{self.eq.id}/")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertIsNone(resp.data["licenses"][0]["key"])

    def _make_observer(self, email):
        from employees.models import Employee

        emp = Employee.objects.create(first_name="Наб", last_name="Людатель")
        observer = User.objects.create_user(email=email, password="Str0ng!Pass1", employee=emp)
        observer.is_observer = True
        observer.save(update_fields=["is_observer"])
        return observer

    def test_observer_views_licenses_but_key_stays_hidden(self):
        self.client.force_authenticate(user=self._make_observer("obs1@example.com"))
        # Раздел «Лицензии» открыт Наблюдателю на просмотр.
        resp = self.client.get("/api/licenses/?tab=active")
        self.assertEqual(resp.status_code, 200)
        # include_key игнорируется — ключ не отдаётся в списке.
        resp = self.client.get("/api/licenses/?include_key=1")
        row = next(r for r in resp.data["results"] if r["id"] == self.lic_id)
        self.assertIsNone(row.get("key"))
        # На карточке значение зафиксированного реквизита-ключа маскируется (None).
        resp = self.client.get(f"/api/licenses/{self.lic_id}/")
        self.assertEqual(resp.status_code, 200)
        locked = [fv for fv in resp.data["field_values"] if fv["is_locked"]]
        self.assertTrue(locked)
        self.assertIsNone(locked[0]["value"])

    def test_history_created_record_marks_key_secret_for_admin(self):
        rows = self.client.get(f"/api/licenses/{self.lic_id}/history/").data
        created = next(r for r in rows if r["kind"] == "created")
        key_line = next(ln for ln in created["lines"] if ln["label"] == "Номер/ключ")
        self.assertTrue(key_line["secret"])
        self.assertEqual(key_line["value"], "AAAA-BBBB-CCCC")

    def test_history_key_withheld_from_observer(self):
        self.client.force_authenticate(user=self._make_observer("obs3@example.com"))
        rows = self.client.get(f"/api/licenses/{self.lic_id}/history/").data
        self.assertNotIn("AAAA-BBBB-CCCC", str(rows))
        created = next(r for r in rows if r["kind"] == "created")
        key_line = next(ln for ln in created["lines"] if ln["label"] == "Номер/ключ")
        self.assertFalse(key_line["secret"])
        self.assertEqual(key_line["value"], "••••")

    def test_observer_cannot_create_license(self):
        self.client.force_authenticate(user=self._make_observer("obs2@example.com"))
        resp = self.client.post(
            "/api/licenses/",
            {"name": "X", "license_type": self.soft_type.id},
            format="json",
        )
        self.assertEqual(resp.status_code, 403)

    def test_plain_employee_has_no_licenses_section(self):
        from employees.models import Employee

        emp = Employee.objects.create(first_name="Обычный", last_name="Сотрудник")
        worker = User.objects.create_user(email="plain@example.com", password="Str0ng!Pass1", employee=emp)
        self.client.force_authenticate(user=worker)
        self.assertEqual(self.client.get("/api/licenses/?tab=active").status_code, 403)


class HardwareLicenseStorageTests(APITestCase):
    """B8 — аппаратная лицензия: хранение на складе, отвязка на склад."""

    def setUp(self):
        self.admin = User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=self.admin)
        from equipment.models import Equipment, EquipmentType
        from locations.models import Building, Place, Room

        b = Building.objects.create(name="Главное")
        r = Room.objects.create(building=b, name="101")
        self.store = Place.objects.create(room=r, name="Склад", place_type=Place.PlaceType.STORAGE)
        et = EquipmentType.objects.create(name="Сервер", allows_license=True)
        self.eq = Equipment.objects.create(inventory_number="SRV-1", equipment_type=et)
        self.hw_type = LicenseType.objects.create(name="Аппаратная", kind="hardware")
        self.token_field = self.hw_type.fields.get(is_locked=True)
        self._n = 0

    def _create(self, **extra):
        self._n += 1
        payload = {
            "name": "Токен",
            "license_type": self.hw_type.id,
            "field_values_input": [{"field": self.token_field.id, "value": f"SN-{self._n}"}],
            **extra,
        }
        return self.client.post("/api/licenses/", payload, format="json")

    def test_create_hardware_on_storage(self):
        resp = self._create(storage_place=self.store.id)
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertTrue(resp.data["is_hardware"])
        self.assertEqual(resp.data["storage_place_detail"]["place_type"], "storage")

    def test_attach_clears_storage_detach_sets_it(self):
        lic_id = self._create(storage_place=self.store.id).data["id"]
        # Привязка к оборудованию снимает со склада.
        r = self.client.patch(f"/api/licenses/{lic_id}/", {"equipment": self.eq.id}, format="json")
        self.assertEqual(r.status_code, 200, r.data)
        self.assertIsNone(r.data["storage_place"])
        self.assertEqual(r.data["status"], "assigned")
        # Отвязка обратно на склад.
        r = self.client.patch(f"/api/licenses/{lic_id}/", {"equipment": None, "storage_place": self.store.id}, format="json")
        self.assertEqual(r.status_code, 200, r.data)
        self.assertIsNone(r.data["equipment"])
        self.assertEqual(r.data["storage_place"], self.store.id)


class LicenseEquipmentAllowsLicenseTests(APITestCase):
    """Привязать лицензию можно только к оборудованию, у типа которого включён
    флаг «Установка лицензий»."""

    def setUp(self):
        from equipment.models import Equipment, EquipmentType

        self.admin = User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=self.admin)
        lt = LicenseType.objects.create(name="Программная", kind="software")
        self.license = License.objects.create(license_type=lt)
        self.type_no = EquipmentType.objects.create(name="Стол", allows_license=False)
        self.type_yes = EquipmentType.objects.create(name="Ноутбук", allows_license=True)
        self.eq_no = Equipment.objects.create(inventory_number="E-NO", equipment_type=self.type_no)
        self.eq_yes = Equipment.objects.create(inventory_number="E-YES", equipment_type=self.type_yes)

    def test_attach_rejected_when_type_disallows_license(self):
        resp = self.client.patch(f"/api/licenses/{self.license.id}/", {"equipment": self.eq_no.id}, format="json")
        self.assertEqual(resp.status_code, 400, resp.data)
        self.assertIn("equipment", resp.data.get("errors", resp.data))

    def test_attach_allowed_when_type_allows_license(self):
        resp = self.client.patch(f"/api/licenses/{self.license.id}/", {"equipment": self.eq_yes.id}, format="json")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data["equipment"], self.eq_yes.id)

    def test_equipment_list_allows_license_filter(self):
        resp = self.client.get("/api/equipment/?tab=active&allows_license=1")
        self.assertEqual(resp.status_code, 200, resp.data)
        ids = {row["id"] for row in resp.data["results"]}
        self.assertIn(self.eq_yes.id, ids)
        self.assertNotIn(self.eq_no.id, ids)
