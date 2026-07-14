import io
import tempfile

from accounts.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from equipment.models import Equipment, EquipmentType
from PIL import Image
from rest_framework.test import APITestCase

from storage import backends as storage_backends

from .models import Employee

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

    def test_terminate_detaches_all_equipment(self):
        resp = self.client.post(f"/api/employees/{self.employee.id}/terminate/", format="json")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data["detached_equipment_count"], 2)
        self.employee.refresh_from_db()
        self.assertFalse(self.employee.is_employed)
        self.eq1.refresh_from_db()
        self.eq2.refresh_from_db()
        self.assertIsNone(self.eq1.employee)
        self.assertIsNone(self.eq2.employee)

    def test_terminate_with_linked_user_deactivation(self):
        user = User.objects.create_user(email="worker@example.com", password="Str0ng!Pass1", employee=self.employee)
        resp = self.client.post(
            f"/api/employees/{self.employee.id}/terminate/", {"deactivate_user": True}, format="json"
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertTrue(resp.data["deactivated_user"])
        user.refresh_from_db()
        self.assertFalse(user.is_active)

    def test_terminate_without_deactivation_keeps_user_active(self):
        user = User.objects.create_user(email="worker@example.com", password="Str0ng!Pass1", employee=self.employee)
        resp = self.client.post(f"/api/employees/{self.employee.id}/terminate/", format="json")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertFalse(resp.data["deactivated_user"])
        user.refresh_from_db()
        self.assertTrue(user.is_active)


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
