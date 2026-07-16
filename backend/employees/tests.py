import io
import tempfile

from accounts.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from equipment.models import Equipment, EquipmentType
from PIL import Image
from rest_framework.test import APITestCase

from storage import backends as storage_backends

from locations.models import Building

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

    def test_terminate_detaches_sim_cards(self):
        # SIM — переиспользуемые объекты: при увольнении отвязываются
        # (деактивируются) и освобождаются для повторной выдачи.
        sim1 = SimCard.objects.create(employee=self.employee, phone_number="+79001112233")
        sim2 = SimCard.objects.create(employee=self.employee, phone_number="+79004445566")
        resp = self.client.post(f"/api/employees/{self.employee.id}/terminate/", format="json")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data["deactivated_sim_count"], 2)
        for sim in (sim1, sim2):
            sim.refresh_from_db()
            self.assertTrue(sim.is_deactivated)
            self.assertIsNone(sim.employee_id)

    def test_restore_marks_employed_again(self):
        self.client.post(f"/api/employees/{self.employee.id}/terminate/", format="json")
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
        sim = SimCard.objects.create(employee=self.employee, phone_number="+79001112233")
        resp = self.client.post(f"/api/sim-cards/{sim.id}/detach/", format="json")
        self.assertEqual(resp.status_code, 200, resp.data)
        sim.refresh_from_db()
        self.assertTrue(sim.is_deactivated)
        self.assertIsNone(sim.employee_id)

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
        active = self.client.get("/api/sim-cards/?tab=active")
        self.assertEqual([s["phone_number"] for s in active.data["results"]], ["+79001112233"])
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

    def test_observer_sees_only_own_not_all(self):
        # У SIM нет страницы-списка, поэтому «Наблюдатель» доступ не расширяет —
        # видит только свои номера, как обычный Сотрудник.
        self.emp_user.is_observer = True
        self.emp_user.save(update_fields=["is_observer"])
        self.client.force_authenticate(user=self.emp_user)
        resp = self.client.get("/api/sim-cards/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual([s["phone_number"] for s in resp.data["results"]], ["+79001112233"])

    def test_observer_cannot_retrieve_foreign_sim(self):
        self.emp_user.is_observer = True
        self.emp_user.save(update_fields=["is_observer"])
        self.client.force_authenticate(user=self.emp_user)
        resp = self.client.get(f"/api/sim-cards/{self.other_sim.id}/")
        self.assertEqual(resp.status_code, 404)

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
        self.building = Building.objects.create(name="Главный офис")

    def _create(self, **extra):
        payload = {"building_ids": [self.building.id], **extra}
        return self.client.post("/api/access-passes/", payload, format="json")

    def test_create_with_name_and_types(self):
        resp = self._create(
            employee=self.employee.id, name="Синий брелок", account_number="A-100",
            type_vehicle=True, type_pedestrian=True,
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data["name"], "Синий брелок")
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

    def test_detach_then_attach(self):
        created = self._create(employee=self.employee.id)
        pass_id = created.data["id"]
        resp = self.client.post(f"/api/access-passes/{pass_id}/detach/", format="json")
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
    """Поиск Сотрудников: Имя, Фамилия, Должность."""

    def setUp(self):
        self.admin = User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=self.admin)
        self.e1 = Employee.objects.create(first_name="Анастасия", last_name="Стратиенко", position="Бухгалтер")
        self.e2 = Employee.objects.create(first_name="Сергей", last_name="Виноградов", position="Водитель")

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
