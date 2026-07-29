"""Отчёты B45 (места/парковки/сотрудники) + новый тип места МОП."""

from accounts.models import User
from employees.models import AccessPass, Employee, SimCard
from equipment.models import Equipment, EquipmentType
from licenses.models import License, LicenseType
from locations.models import Building, Place, Room
from locations.serializers import PlaceSerializer
from rest_framework.test import APITestCase
from tools.models import Tool, ToolAllocation
from transport.models import Transport, TransportType


class CommonPlaceSerializerTests(APITestCase):
    def setUp(self):
        self.b = Building.objects.create(name="Здание")
        self.r = Room.objects.create(building=self.b, name="101")
        self.emp = Employee.objects.create(first_name="Иван", last_name="Иванов")

    def test_common_place_rejects_employees(self):
        s = PlaceSerializer(data={
            "room": self.r.id, "name": "Кофепоинт", "place_type": "common",
            "employees": [self.emp.id],
        })
        self.assertFalse(s.is_valid())
        self.assertIn("employees", s.errors)

    def test_common_place_created_without_employees(self):
        s = PlaceSerializer(data={"room": self.r.id, "name": "Кофепоинт", "place_type": "common"})
        self.assertTrue(s.is_valid(), s.errors)
        place = s.save()
        self.assertEqual(place.place_type, "common")
        self.assertEqual(place.employees.count(), 0)


class CommonPlacementTests(APITestCase):
    """МОП принимает имущество как рабочее место (стационарно, не свободно)."""

    def setUp(self):
        self.admin = User.objects.create_superuser(email="a@e.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=self.admin)
        self.b = Building.objects.create(name="Здание")
        self.r = Room.objects.create(building=self.b, name="101")
        self.common = Place.objects.create(room=self.r, name="Кофепоинт", place_type="common")
        self.et = EquipmentType.objects.create(name="Холодильник")

    def test_equipment_on_common_is_stationary(self):
        eq = Equipment.objects.create(inventory_number="EQ-1", equipment_type=self.et, place=self.common)
        resp = self.client.get(f"/api/equipment/{eq.id}/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["status"], "stationary")

    def test_tool_assigned_to_common_counts_as_assigned(self):
        tool = Tool.objects.create(name="Стакан", quantity=5)
        ToolAllocation.objects.create(tool=tool, place=self.common, quantity=5)
        resp = self.client.get(f"/api/tools/{tool.id}/")
        self.assertEqual(resp.status_code, 200)
        # Свободно = 0 (весь остаток стоит стационарно на МОП).
        self.assertEqual(resp.data["free"], 0)


class ReportsDataMixin:
    def build_data(self):
        self.b = Building.objects.create(name="Здание А")
        self.r = Room.objects.create(building=self.b, name="Каб. 101", floor="1")
        self.emp = Employee.objects.create(first_name="Иван", last_name="Иванов", position="Инженер")
        self.et = EquipmentType.objects.create(name="Ноутбук", allows_sim=True, allows_license=True)
        self.lt = LicenseType.objects.create(name="Windows")

        # Рабочее место с сотрудником + оборудование + инструмент.
        self.wp = Place.objects.create(room=self.r, name="РМ-1", place_type="workplace")
        self.wp.employees.add(self.emp)
        self.wp_eq = Equipment.objects.create(inventory_number="EQ-WP", equipment_type=self.et, place=self.wp)
        self.tool = Tool.objects.create(name="Отвёртка", quantity=3)
        ToolAllocation.objects.create(tool=self.tool, place=self.wp, quantity=3)
        # Пустое рабочее место.
        self.wp_empty = Place.objects.create(room=self.r, name="РМ-2", place_type="workplace")

        # МОП с оборудованием.
        self.common = Place.objects.create(room=self.r, name="Кофепоинт", place_type="common")
        self.common_eq = Equipment.objects.create(inventory_number="EQ-MOP", equipment_type=self.et, place=self.common)

        # Склад с оборудованием.
        self.storage = Place.objects.create(room=self.r, name="Склад", place_type="storage")
        Equipment.objects.create(inventory_number="EQ-ST", equipment_type=self.et, place=self.storage)

        # Парковка.
        self.pr = Room.objects.create(building=self.b, name="Паркинг", parking_type="floor", floor="-1")
        self.spot_emp = Place.objects.create(room=self.pr, name="М-1", place_type="parking_spot")
        self.spot_emp.employees.add(self.emp)
        self.tt = TransportType.objects.create(name="Легковой")
        self.car = Transport.objects.create(inventory_number="TR-1", transport_type=self.tt)
        self.spot_tr = Place.objects.create(room=self.pr, name="М-2", place_type="parking_spot")
        self.spot_tr.transport.add(self.car)

        # Имущество напрямую за сотрудником.
        self.emp_eq = Equipment.objects.create(inventory_number="EQ-EMP", equipment_type=self.et, employee=self.emp)
        SimCard.objects.create(phone_number="+70000000001", equipment=self.emp_eq)  # SIM в оборудовании
        License.objects.create(license_type=self.lt, equipment=self.emp_eq)          # лицензия в оборудовании
        SimCard.objects.create(phone_number="+70000000002", employee=self.emp)       # SIM за сотрудником
        AccessPass.objects.create(object_type="key", account_number="KEY-1", employee=self.emp)
        Transport.objects.create(inventory_number="TR-EMP", transport_type=self.tt, employee=self.emp)
        ToolAllocation.objects.create(tool=self.tool, employee=self.emp, quantity=1)


class ReportsAccessTests(APITestCase, ReportsDataMixin):
    def setUp(self):
        self.build_data()
        self.admin = User.objects.create_superuser(email="admin@e.com", password="Str0ng!Pass1")
        self.accountant = User.objects.create_user(email="acc@e.com", password="Str0ng!Pass1", role=User.Role.ACCOUNTANT)
        self.employee = User.objects.create_user(email="emp@e.com", password="Str0ng!Pass1", role=User.Role.EMPLOYEE)
        self.observer = User.objects.create_user(
            email="obs@e.com", password="Str0ng!Pass1", role=User.Role.EMPLOYEE, is_observer=True,
        )

    def test_admin_and_accountant_allowed(self):
        for user in (self.admin, self.accountant):
            self.client.force_authenticate(user=user)
            for url in ("/api/reports/places/?kind=workplace", "/api/reports/parking/", "/api/reports/employees/"):
                self.assertEqual(self.client.get(url).status_code, 200, url)

    def test_employee_and_observer_forbidden(self):
        for user in (self.employee, self.observer):
            self.client.force_authenticate(user=user)
            self.assertEqual(self.client.get("/api/reports/places/?kind=workplace").status_code, 403)
            self.assertEqual(self.client.get("/api/reports/employees/").status_code, 403)


class ReportsContentTests(APITestCase, ReportsDataMixin):
    def setUp(self):
        self.build_data()
        self.admin = User.objects.create_superuser(email="admin@e.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=self.admin)

    def _places(self, place_map):
        """{place_name: place_dict} из отчёта по местам."""
        out = {}
        for b in place_map:
            for r in b["rooms"]:
                for p in r["places"]:
                    out[p["name"]] = p
        return out

    def test_workplace_report(self):
        resp = self.client.get("/api/reports/places/?kind=workplace")
        self.assertEqual(resp.status_code, 200)
        places = self._places(resp.data["buildings"])
        self.assertIn("РМ-1", places)
        self.assertIn("РМ-2", places)  # пустое место показывается
        self.assertEqual(len(places["РМ-1"]["equipment"]), 1)
        self.assertEqual(len(places["РМ-1"]["tools"]), 1)
        self.assertEqual([e["name"] for e in places["РМ-1"]["employees"]], ["Иванов Иван"])
        self.assertEqual(places["РМ-2"]["equipment"], [])

    def test_common_report(self):
        resp = self.client.get("/api/reports/places/?kind=common")
        places = self._places(resp.data["buildings"])
        self.assertIn("Кофепоинт", places)
        self.assertEqual(len(places["Кофепоинт"]["equipment"]), 1)
        # У МОП нет закреплённых сотрудников.
        self.assertNotIn("employees", places["Кофепоинт"])

    def test_storage_report(self):
        resp = self.client.get("/api/reports/places/?kind=storage")
        places = self._places(resp.data["buildings"])
        self.assertIn("Склад", places)
        self.assertEqual(len(places["Склад"]["equipment"]), 1)

    def test_building_filter(self):
        b2 = Building.objects.create(name="Здание Б")
        r2 = Room.objects.create(building=b2, name="Каб. 201")
        Place.objects.create(room=r2, name="РМ-Б", place_type="workplace")
        resp = self.client.get(f"/api/reports/places/?kind=workplace&building={self.b.id}")
        names = [b["name"] for b in resp.data["buildings"]]
        self.assertEqual(names, ["Здание А"])

    def test_parking_report(self):
        resp = self.client.get("/api/reports/parking/")
        places = self._places(resp.data["buildings"])
        self.assertEqual([e["name"] for e in places["М-1"]["employees"]], ["Иванов Иван"])
        self.assertEqual(places["М-1"]["transport"], [])
        self.assertEqual(len(places["М-2"]["transport"]), 1)

    def test_employees_report(self):
        # B32: статус акцепта закрепления оборудования за сотрудником.
        from django.contrib.contenttypes.models import ContentType

        from employees.models import EmployeeAssignment
        EmployeeAssignment.objects.create(
            content_type=ContentType.objects.get_for_model(Equipment), object_id=self.emp_eq.id,
            object_kind="equipment", employee=self.emp, status="pending",
        )
        resp = self.client.get("/api/reports/employees/")
        self.assertEqual(resp.status_code, 200)
        emp = next(e for e in resp.data["employees"] if e["id"] == self.emp.id)
        self.assertEqual(emp["equipment"][0]["acceptance_status"], "pending")
        # Оборудование за сотрудником с вложенными SIM и лицензией.
        self.assertEqual(len(emp["equipment"]), 1)
        self.assertEqual(len(emp["equipment"][0]["sim"]), 1)
        self.assertEqual(len(emp["equipment"][0]["licenses"]), 1)
        # SIM за сотрудником, пропуск/ключ, транспорт, инструмент.
        self.assertEqual(len(emp["sim"]), 1)
        self.assertEqual(len(emp["passes"]), 1)
        self.assertEqual(len(emp["transport"]), 1)
        self.assertEqual(len(emp["tools"]), 1)
        # Рабочее место сотрудника с имуществом на нём.
        self.assertEqual(len(emp["workplaces"]), 1)
        wp = emp["workplaces"][0]
        self.assertEqual(wp["name"], "РМ-1")
        self.assertEqual(len(wp["equipment"]), 1)
        self.assertEqual(len(wp["tools"]), 1)

    def test_employee_filter(self):
        other = Employee.objects.create(first_name="Пётр", last_name="Петров")
        resp = self.client.get(f"/api/reports/employees/?employee={self.emp.id}")
        ids = [e["id"] for e in resp.data["employees"]]
        self.assertEqual(ids, [self.emp.id])
        self.assertNotIn(other.id, ids)
