"""B12 — объединение сотрудников-дубликатов: детекция, слияние, контроль
создания/регистрации, вход через Яндекс ID."""

from accounts.models import User
from equipment.models import Equipment, EquipmentType
from locations.models import Building, Place, Room
from rest_framework.test import APITestCase
from tools.models import Tool, ToolAllocation, ToolMovement

from .duplicates import (
    active_duplicate_count,
    duplicate_groups,
    merge_employee,
    registration_decision,
    resolve_group,
)
from .models import AccessPass, Employee, EmployeeDuplicateDismissal, SimCard


def _emp(last="Прозоров", first="Иван", **kw):
    return Employee.objects.create(last_name=last, first_name=first, **kw)


class MergeReferenceTransferTests(APITestCase):
    """Ключевой инвариант: при слиянии НИ ОДНА ссылка не теряется."""

    def setUp(self):
        self.b = Building.objects.create(name="Здание")
        self.r = Room.objects.create(building=self.b, name="Комн.")
        self.workplace = Place.objects.create(room=self.r, name="РМ-1", place_type=Place.PlaceType.WORKPLACE)
        self.eq_type = EquipmentType.objects.create(name="ПК")

    def test_all_reference_kinds_move_to_target(self):
        target = _emp()
        source = _emp()
        # Оборудование
        eq = Equipment.objects.create(inventory_number="PC-1", equipment_type=self.eq_type, employee=source)
        # SIM
        sim = SimCard.objects.create(employee=source, phone_number="+79001112233")
        # Пропуск
        ap = AccessPass.objects.create(employee=source)
        # Инструмент (у source своя выдача, у target нет)
        tool = Tool.objects.create(name="Дрель", quantity=5)
        ToolAllocation.objects.create(tool=tool, employee=source, quantity=3)
        ToolMovement.objects.create(tool=tool, kind=ToolMovement.Kind.ASSIGN, quantity=3, employee=source)
        # Рабочее место (M2M)
        self.workplace.employees.add(source)

        merge_employee(target, source)

        eq.refresh_from_db()
        sim.refresh_from_db()
        ap.refresh_from_db()
        self.assertEqual(eq.employee_id, target.id)
        self.assertEqual(sim.employee_id, target.id)
        self.assertEqual(ap.employee_id, target.id)
        self.assertEqual(ToolAllocation.objects.get(tool=tool, employee=target).quantity, 3)
        self.assertEqual(ToolMovement.objects.filter(employee=target).count(), 1)
        self.assertIn(target, self.workplace.employees.all())
        self.assertNotIn(source, self.workplace.employees.all())
        self.assertFalse(Employee.objects.filter(pk=source.id).exists())

    def test_tool_allocation_quantities_merge(self):
        target = _emp()
        source = _emp()
        tool = Tool.objects.create(name="Дрель", quantity=5)
        ToolAllocation.objects.create(tool=tool, employee=target, quantity=2)
        ToolAllocation.objects.create(tool=tool, employee=source, quantity=3)

        merge_employee(target, source)

        allocs = ToolAllocation.objects.filter(tool=tool, employee=target)
        self.assertEqual(allocs.count(), 1)
        self.assertEqual(allocs.first().quantity, 5)  # 2 + 3, ничего не потеряно

    def test_reference_count_conserved(self):
        target = _emp()
        source = _emp()
        for i in range(2):
            Equipment.objects.create(inventory_number=f"T-{i}", equipment_type=self.eq_type, employee=target)
        for i in range(3):
            Equipment.objects.create(inventory_number=f"S-{i}", equipment_type=self.eq_type, employee=source)
        before = Equipment.objects.filter(employee__in=[target, source]).count()

        merge_employee(target, source)

        self.assertEqual(Equipment.objects.filter(employee=target).count(), before)  # 5

    def test_merge_refuses_linked_source(self):
        target = _emp()
        source = _emp()
        User.objects.create_user(email="s@example.com", password="Str0ng!Pass1", employee=source)
        with self.assertRaises(ValueError):
            merge_employee(target, source)


class DetectionTests(APITestCase):
    def test_all_linked_is_not_duplicate(self):
        a, b = _emp(), _emp()
        User.objects.create_user(email="a@example.com", password="Str0ng!Pass1", employee=a)
        User.objects.create_user(email="b@example.com", password="Str0ng!Pass1", employee=b)
        self.assertEqual(duplicate_groups(), [])

    def test_one_linked_one_unlinked_is_duplicate(self):
        a, _ = _emp(), _emp()
        User.objects.create_user(email="a@example.com", password="Str0ng!Pass1", employee=a)
        groups = duplicate_groups()
        self.assertEqual(len(groups), 1)
        self.assertEqual(groups[0]["resolution_kind"], "auto_linked")

    def test_two_unlinked_is_duplicate_auto_most_refs(self):
        _emp(), _emp()
        groups = duplicate_groups()
        self.assertEqual(len(groups), 1)
        self.assertEqual(groups[0]["resolution_kind"], "auto_most_refs")

    def test_terminated_ignored(self):
        _emp()
        _emp(is_employed=False)
        self.assertEqual(duplicate_groups(), [])

    def test_case_and_space_insensitive(self):
        _emp(last="Прозоров", first="Иван")
        _emp(last="прозоров ", first=" иван")
        self.assertEqual(len(duplicate_groups()), 1)

    def test_dismiss_hides_from_active_count(self):
        _emp(), _emp()
        sig = duplicate_groups()[0]["signature"]
        self.assertEqual(active_duplicate_count(), 1)
        EmployeeDuplicateDismissal.objects.create(signature=sig, member_ids=[e.id for e in Employee.objects.all()])
        self.assertEqual(active_duplicate_count(), 0)
        # но в полном списке — с флагом dismissed
        self.assertTrue(duplicate_groups()[0]["dismissed"])


class ResolveTests(APITestCase):
    def setUp(self):
        self.eq_type = EquipmentType.objects.create(name="ПК")

    def test_principle_1_auto_into_linked(self):
        linked = _emp()
        unlinked = _emp()
        User.objects.create_user(email="l@example.com", password="Str0ng!Pass1", employee=linked)
        Equipment.objects.create(inventory_number="PC-1", equipment_type=self.eq_type, employee=unlinked)

        sig = duplicate_groups()[0]["signature"]
        survivors = resolve_group(sig)

        self.assertEqual(survivors, [linked.id])
        self.assertFalse(Employee.objects.filter(pk=unlinked.id).exists())
        self.assertEqual(Equipment.objects.get(inventory_number="PC-1").employee_id, linked.id)

    def test_principle_3_survivor_has_most_refs(self):
        few = _emp()
        many = _emp()
        Equipment.objects.create(inventory_number="A", equipment_type=self.eq_type, employee=few)
        for i in range(3):
            Equipment.objects.create(inventory_number=f"B-{i}", equipment_type=self.eq_type, employee=many)

        sig = duplicate_groups()[0]["signature"]
        survivors = resolve_group(sig)

        self.assertEqual(survivors, [many.id])
        self.assertFalse(Employee.objects.filter(pk=few.id).exists())
        self.assertEqual(Equipment.objects.filter(employee=many).count(), 4)

    def test_principle_2_requires_mapping(self):
        l1, l2 = _emp(), _emp()
        u = _emp()
        User.objects.create_user(email="l1@example.com", password="Str0ng!Pass1", employee=l1)
        User.objects.create_user(email="l2@example.com", password="Str0ng!Pass1", employee=l2)
        Equipment.objects.create(inventory_number="PC-1", equipment_type=self.eq_type, employee=u)

        sig = duplicate_groups()[0]["signature"]
        # без маппинга — ошибка
        with self.assertRaises(ValueError):
            resolve_group(sig)
        # с маппингом u -> l2
        survivors = resolve_group(sig, mapping={str(u.id): l2.id})
        self.assertEqual(survivors, [l2.id])
        self.assertEqual(Equipment.objects.get(inventory_number="PC-1").employee_id, l2.id)

    def test_resolve_blocked_when_dismissed(self):
        _emp(), _emp()
        sig = duplicate_groups()[0]["signature"]
        EmployeeDuplicateDismissal.objects.create(signature=sig, member_ids=[e.id for e in Employee.objects.all()])
        with self.assertRaises(ValueError):
            resolve_group(sig)


class RegistrationDecisionTests(APITestCase):
    def test_no_match_creates(self):
        self.assertEqual(registration_decision("Нетаких", "Никто")[0], "create")

    def test_single_unlinked_links(self):
        e = _emp()
        kind, emp = registration_decision("Прозоров", "Иван")
        self.assertEqual(kind, "link")
        self.assertEqual(emp.id, e.id)

    def test_all_linked_exists(self):
        e = _emp()
        User.objects.create_user(email="e@example.com", password="Str0ng!Pass1", employee=e)
        self.assertEqual(registration_decision("Прозоров", "Иван")[0], "exists")

    def test_two_unlinked_ambiguous(self):
        _emp(), _emp()
        self.assertEqual(registration_decision("Прозоров", "Иван")[0], "ambiguous")

    def test_one_unlinked_among_linked_links(self):
        # Один без учётки при наличии связанного тёзки — привязка к нему (3.ii).
        linked = _emp()
        unlinked = _emp()
        User.objects.create_user(email="l@example.com", password="Str0ng!Pass1", employee=linked)
        kind, emp = registration_decision("Прозоров", "Иван")
        self.assertEqual(kind, "link")
        self.assertEqual(emp.id, unlinked.id)


class RegistrationApiTests(APITestCase):
    def _register(self, **extra):
        payload = {
            "email": "new@example.com",
            "password": "Str0ng!Pass1",
            "password_repeat": "Str0ng!Pass1",
            "last_name": "Прозоров",
            "first_name": "Иван",
            **extra,
        }
        return self.client.post("/api/auth/register/", payload, format="json")

    def test_register_links_to_existing_unlinked(self):
        existing = _emp()
        resp = self._register()
        self.assertEqual(resp.status_code, 201, resp.data)
        user = User.objects.get(email="new@example.com")
        self.assertEqual(user.employee_id, existing.id)  # привязан, не создан новый
        self.assertEqual(Employee.objects.filter(last_name="Прозоров").count(), 1)

    def test_register_rejected_when_all_linked(self):
        e = _emp()
        User.objects.create_user(email="e@example.com", password="Str0ng!Pass1", employee=e)
        resp = self._register()
        self.assertEqual(resp.status_code, 400)

    def test_register_rejected_when_ambiguous(self):
        _emp(), _emp()
        resp = self._register()
        self.assertEqual(resp.status_code, 400)


class CreationWarningApiTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=self.admin)

    def test_create_employee_warns_on_namesake(self):
        _emp()
        resp = self.client.post(
            "/api/employees/", {"last_name": "Прозоров", "first_name": "Иван"}, format="json"
        )
        self.assertEqual(resp.status_code, 409, resp.data)
        self.assertTrue(resp.data["requires_duplicate_confirmation"])
        self.assertEqual(Employee.objects.filter(last_name="Прозоров").count(), 1)

    def test_create_employee_confirmed_creates(self):
        _emp()
        resp = self.client.post(
            "/api/employees/",
            {"last_name": "Прозоров", "first_name": "Иван", "confirm_duplicate": True},
            format="json",
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(Employee.objects.filter(last_name="Прозоров").count(), 2)

    def test_duplicates_endpoint_lists_groups(self):
        _emp(), _emp()
        resp = self.client.get("/api/employees/duplicates/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data["groups"]), 1)
        self.assertEqual(resp.data["active_count"], 1)

    def test_resolve_endpoint_merges(self):
        few = _emp()
        many = _emp()
        et = EquipmentType.objects.create(name="ПК")
        Equipment.objects.create(inventory_number="A", equipment_type=et, employee=many)
        sig = self.client.get("/api/employees/duplicates/").data["groups"][0]["signature"]
        resp = self.client.post("/api/employees/duplicates/resolve/", {"signature": sig}, format="json")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data["survivors"], [many.id])
        self.assertFalse(Employee.objects.filter(pk=few.id).exists())

    def test_dismiss_and_undismiss_endpoints(self):
        _emp(), _emp()
        sig = self.client.get("/api/employees/duplicates/").data["groups"][0]["signature"]
        self.assertEqual(self.client.post("/api/employees/duplicates/dismiss/", {"signature": sig}, format="json").status_code, 200)
        self.assertEqual(self.client.get("/api/employees/duplicates-count/").data["count"], 0)
        self.assertEqual(self.client.post("/api/employees/duplicates/undismiss/", {"signature": sig}, format="json").status_code, 200)
        self.assertEqual(self.client.get("/api/employees/duplicates-count/").data["count"], 1)

    def test_duplicates_forbidden_for_accountant(self):
        acc = User.objects.create_user(
            email="acc@example.com", password="Str0ng!Pass1", role=User.Role.ACCOUNTANT
        )
        self.client.force_authenticate(user=acc)
        self.assertEqual(self.client.get("/api/employees/duplicates/").status_code, 403)
        self.assertEqual(self.client.get("/api/employees/duplicates-count/").status_code, 403)
