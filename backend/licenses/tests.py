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

    def test_missing_required_key_blocks_creation(self):
        resp = self.client.post(
            "/api/licenses/", {"name": "Без ключа", "license_type": self.software.id}, format="json"
        )
        self.assertEqual(resp.status_code, 400)
        self.assertFalse(License.objects.filter(name="Без ключа").exists())


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
