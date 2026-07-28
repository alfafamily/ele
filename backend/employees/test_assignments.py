"""B32 — подтверждение получения сотрудником (акцепт выдачи)."""

from accounts.models import User
from company.models import Company
from django.core import mail
from equipment.models import Equipment, EquipmentType
from locations.models import Building, Place, Room
from rest_framework.test import APITestCase
from tools.models import Tool, ToolAllocation

from core.assignments import open_assignment
from .models import AccessPass, Employee, EmployeeAssignment, SimCard


def _emp(last="Прозоров", first="Иван", **kw):
    return Employee.objects.create(last_name=last, first_name=first, **kw)


class AssignmentBaseTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(email="admin@e.ru", password="Str0ng!Pass1", role=User.Role.ADMIN)
        self.b = Building.objects.create(name="Здание")
        self.r = Room.objects.create(building=self.b, name="Комн.")
        self.storage = Place.objects.create(room=self.r, name="Склад-1", place_type=Place.PlaceType.STORAGE)
        self.eq_type = EquipmentType.objects.create(name="ПК")

    def _equip(self, **kw):
        return Equipment.objects.create(inventory_number=kw.pop("num", "PC-1"), equipment_type=self.eq_type, **kw)

    def _assign(self, eq, emp):
        self.client.force_authenticate(self.admin)
        return self.client.post(f"/api/equipment/{eq.id}/assign/", {"mode": "mobile", "employee": emp.id})


class StatusTests(AssignmentBaseTests):
    def test_assign_without_user_is_in_absentia(self):
        emp = _emp()
        eq = self._equip(place=self.storage)
        self._assign(eq, emp)
        a = open_assignment(eq)
        self.assertEqual(a.status, EmployeeAssignment.Status.IN_ABSENTIA)
        self.assertEqual(a.return_place_id, self.storage.id)
        self.assertEqual(len(mail.outbox), 0)

    def test_assign_with_user_is_pending_and_emails(self):
        emp = _emp()
        User.objects.create_user(email="worker@e.ru", password="Str0ng!Pass1", employee=emp)
        eq = self._equip(place=self.storage)
        self._assign(eq, emp)
        a = open_assignment(eq)
        self.assertEqual(a.status, EmployeeAssignment.Status.PENDING)
        self.assertEqual(len(mail.outbox), 1)

    def test_stationary_creates_no_episode(self):
        wp = Place.objects.create(room=self.r, name="РМ-1", place_type=Place.PlaceType.WORKPLACE)
        eq = self._equip(place=self.storage)
        self.client.force_authenticate(self.admin)
        self.client.post(f"/api/equipment/{eq.id}/assign/", {"mode": "stationary", "place": wp.id})
        self.assertIsNone(open_assignment(eq))


class DecisionTests(AssignmentBaseTests):
    def setUp(self):
        super().setUp()
        self.emp = _emp()
        self.user = User.objects.create_user(email="worker@e.ru", password="Str0ng!Pass1", employee=self.emp)

    def test_accept(self):
        eq = self._equip(place=self.storage)
        self._assign(eq, self.emp)
        a = open_assignment(eq)
        self.client.force_authenticate(self.user)
        resp = self.client.post(f"/api/assignments/{a.id}/accept/")
        self.assertEqual(resp.status_code, 200)
        a.refresh_from_db()
        self.assertEqual(a.status, EmployeeAssignment.Status.ACCEPTED)
        self.assertIsNone(a.device_snapshot)  # флаг слепка выключен по умолчанию

    def test_accept_captures_snapshot_when_enabled(self):
        c = Company.load()
        c.device_snapshot_enabled = True
        c.save()
        eq = self._equip(place=self.storage)
        self._assign(eq, self.emp)
        a = open_assignment(eq)
        self.client.force_authenticate(self.user)
        self.client.post(f"/api/assignments/{a.id}/accept/",
                         {"device": {"timezone": "Europe/Moscow"}}, format="json",
                         HTTP_USER_AGENT="Mozilla/5.0 (Windows NT 10.0)")
        a.refresh_from_db()
        self.assertIsNotNone(a.device_snapshot)
        self.assertEqual(a.device_snapshot.get("os"), "Windows")
        self.assertEqual(a.device_snapshot.get("timezone"), "Europe/Moscow")

    def test_reject_returns_object(self):
        eq = self._equip(place=self.storage)
        self._assign(eq, self.emp)
        a = open_assignment(eq)
        self.client.force_authenticate(self.user)
        self.client.post(f"/api/assignments/{a.id}/reject/")
        a.refresh_from_db()
        eq.refresh_from_db()
        self.assertEqual(a.status, EmployeeAssignment.Status.REJECTED)
        self.assertIsNotNone(a.closed_at)
        self.assertIsNone(eq.employee_id)
        self.assertEqual(eq.place_id, self.storage.id)  # вернулось на прежний склад

    def test_only_owner_decides(self):
        other = User.objects.create_user(email="o@e.ru", password="Str0ng!Pass1", role=User.Role.ADMIN)
        eq = self._equip(place=self.storage)
        self._assign(eq, self.emp)
        a = open_assignment(eq)
        self.client.force_authenticate(other)
        resp = self.client.post(f"/api/assignments/{a.id}/accept/")
        self.assertEqual(resp.status_code, 403)


class RelinkTests(AssignmentBaseTests):
    def test_linking_user_flips_in_absentia_to_pending(self):
        emp = _emp()
        eq = self._equip(place=self.storage)
        self._assign(eq, emp)
        self.assertEqual(open_assignment(eq).status, EmployeeAssignment.Status.IN_ABSENTIA)
        # Увязываем пользователя к сотруднику — эпизод должен стать pending.
        User.objects.create_user(email="worker@e.ru", password="Str0ng!Pass1", employee=emp)
        a = open_assignment(eq)
        self.assertEqual(a.status, EmployeeAssignment.Status.PENDING)
        self.assertTrue(a.was_in_absentia)


class TransportTests(AssignmentBaseTests):
    def test_transport_assign_and_reject(self):
        from transport.models import Transport, TransportType

        emp = _emp()
        user = User.objects.create_user(email="w@e.ru", password="Str0ng!Pass1", employee=emp)
        tt = TransportType.objects.create(name="Легковой")
        tr = Transport.objects.create(inventory_number="TS-1", transport_type=tt)
        self.client.force_authenticate(self.admin)
        self.client.post(f"/api/transport/{tr.id}/assign/", {"employee": emp.id})
        a = open_assignment(tr)
        self.assertIsNotNone(a)
        self.assertEqual(a.object_kind, EmployeeAssignment.ObjectKind.TRANSPORT)
        self.assertEqual(a.status, EmployeeAssignment.Status.PENDING)
        self.client.force_authenticate(user)
        self.client.post(f"/api/assignments/{a.id}/reject/")
        tr.refresh_from_db()
        self.assertIsNone(tr.employee_id)


class ToolTests(AssignmentBaseTests):
    def test_tool_assign_and_unassign_episode(self):
        emp = _emp()
        tool = Tool.objects.create(name="Дрель", quantity=5)
        ToolAllocation.objects.create(tool=tool, place=self.storage, quantity=5)
        self.client.force_authenticate(self.admin)
        self.client.post(f"/api/tools/{tool.id}/assign-units/",
                         {"mode": "mobile", "employee": emp.id, "quantity": 2, "from_place": self.storage.id})
        a = open_assignment(tool)
        self.assertEqual(a.status, EmployeeAssignment.Status.IN_ABSENTIA)
        self.assertEqual(a.return_quantity, 2)
        # Возврат закрывает эпизод.
        self.client.post(f"/api/tools/{tool.id}/unassign-units/",
                         {"mode": "mobile", "employee": emp.id, "quantity": 2, "to_place": self.storage.id})
        self.assertIsNone(open_assignment(tool))
