import io
import tempfile

from accounts.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from equipment.models import Equipment, EquipmentType
from PIL import Image
from rest_framework.test import APITestCase

from storage import backends as storage_backends

from .models import Employee, SimCard

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

    def test_terminate_deactivates_sim_cards_but_keeps_them(self):
        sim1 = SimCard.objects.create(employee=self.employee, phone_number="+79001112233")
        sim2 = SimCard.objects.create(employee=self.employee, phone_number="+79004445566")
        resp = self.client.post(f"/api/employees/{self.employee.id}/terminate/", format="json")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data["deactivated_sim_count"], 2)
        for sim in (sim1, sim2):
            sim.refresh_from_db()
            self.assertTrue(sim.is_deactivated)
            self.assertIsNotNone(sim.deactivated_at)
            # Номер остаётся закреплён за сотрудником — для истории.
            self.assertEqual(sim.employee_id, self.employee.id)


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

    def test_deactivate_action_keeps_record(self):
        sim = SimCard.objects.create(employee=self.employee, phone_number="+79001112233")
        resp = self.client.post(f"/api/sim-cards/{sim.id}/deactivate/", format="json")
        self.assertEqual(resp.status_code, 200, resp.data)
        sim.refresh_from_db()
        self.assertTrue(sim.is_deactivated)
        self.assertIsNotNone(sim.deactivated_at)

    def test_filter_by_employee(self):
        other = Employee.objects.create(first_name="Пётр", last_name="Сидоров")
        SimCard.objects.create(employee=self.employee, phone_number="+79001112233")
        SimCard.objects.create(employee=other, phone_number="+79004445566")
        resp = self.client.get(f"/api/sim-cards/?employee={self.employee.id}")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 1)
        self.assertEqual(resp.data[0]["phone_number"], "+79001112233")

    def test_embedded_in_employee_card_active_and_archived(self):
        SimCard.objects.create(employee=self.employee, phone_number="+79001112233")
        SimCard.objects.create(
            employee=self.employee, phone_number="+79004445566", is_deactivated=True
        )
        resp = self.client.get(f"/api/employees/{self.employee.id}/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data["sim_cards"]), 2)

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
