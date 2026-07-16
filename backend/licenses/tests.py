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
        self.software = LicenseType.objects.get(name="Программная")
        self.key_field = self.software.fields.get(is_locked=True)

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

    def test_key_optional_allows_creation_without_key(self):
        # «Номер/ключ» необязателен: лицензий без ключа может быть несколько.
        r1 = self.client.post(
            "/api/licenses/", {"name": "Без ключа 1", "license_type": self.software.id}, format="json"
        )
        r2 = self.client.post(
            "/api/licenses/", {"name": "Без ключа 2", "license_type": self.software.id}, format="json"
        )
        self.assertEqual(r1.status_code, 201, r1.data)
        self.assertEqual(r2.status_code, 201, r2.data)

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


class LicenseHardcodedTypesTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=self.admin)

    def test_cannot_delete_or_rename_hardcoded_type(self):
        software = LicenseType.objects.get(name="Программная")
        resp = self.client.delete(f"/api/license-types/{software.id}/")
        self.assertEqual(resp.status_code, 409)

        resp = self.client.patch(f"/api/license-types/{software.id}/", {"name": "Другое имя"}, format="json")
        self.assertEqual(resp.status_code, 400)

    def test_cannot_delete_locked_key_field(self):
        software = LicenseType.objects.get(name="Программная")
        key_field = software.fields.get(is_locked=True)
        resp = self.client.delete(f"/api/license-types/{software.id}/fields/{key_field.id}/")
        self.assertEqual(resp.status_code, 409)


class LicenseUtilizeTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=self.admin)
        self.hardware = LicenseType.objects.get(name="Аппаратная")

    def test_utilize_detaches_and_archives(self):
        from equipment.models import Equipment, EquipmentType

        eq_type = EquipmentType.objects.create(name="Сервер")
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
    """Поиск по списку Лицензий: Наименование, Тип, Учётный номер Оборудования."""

    def setUp(self):
        from equipment.models import Equipment, EquipmentType

        self.admin = User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=self.admin)
        self.type_a = LicenseType.objects.create(name="Антивирус")
        self.type_b = LicenseType.objects.create(name="Офис")
        eq_type = EquipmentType.objects.create(name="ПК")
        self.eq = Equipment.objects.create(inventory_number="DESKTOP-42", equipment_type=eq_type)
        self.lic1 = License.objects.create(name="Kaspersky", license_type=self.type_a, equipment=self.eq)
        self.lic2 = License.objects.create(name="Microsoft 365", license_type=self.type_b)

    def _search_ids(self, term):
        resp = self.client.get("/api/licenses/", {"search": term})
        self.assertEqual(resp.status_code, 200, resp.data)
        return {row["id"] for row in resp.data["results"]}

    def test_search_by_name(self):
        self.assertEqual(self._search_ids("Kaspersky"), {self.lic1.id})

    def test_search_by_type(self):
        self.assertEqual(self._search_ids("Офис"), {self.lic2.id})

    def test_search_by_equipment_inventory_number(self):
        self.assertEqual(self._search_ids("DESKTOP-42"), {self.lic1.id})


class LicenseKeyExposureTests(APITestCase):
    """«Номер/ключ» отдаётся в списке только по ?include_key=1 и на карточке
    Оборудования только Admin/Accountant; в обычном списке отсутствует."""

    def setUp(self):
        from equipment.models import Equipment, EquipmentType

        self.admin = User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=self.admin)
        self.soft_type = LicenseType.objects.get(name="Программная")
        self.key_field = self.soft_type.fields.get(name="Номер/ключ")
        eq_type = EquipmentType.objects.create(name="ПК")
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
