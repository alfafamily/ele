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
        self.client.post(f"/api/assignments/{a.id}/reject/", {"comment": "не подходит"})
        a.refresh_from_db()
        eq.refresh_from_db()
        self.assertEqual(a.status, EmployeeAssignment.Status.REJECTED)
        self.assertIsNotNone(a.closed_at)
        self.assertIsNone(eq.employee_id)
        self.assertEqual(eq.place_id, self.storage.id)  # вернулось на прежний склад

    def test_reassign_after_reject_shows_new_pending(self):
        # assign → reject → assign снова: новая запись закрепления должна появиться
        # (регресс: skip_history рвал diff-цепочку, и повтор не отражался).
        eq = self._equip(place=self.storage)
        self._assign(eq, self.emp)
        a1 = open_assignment(eq)
        self.client.force_authenticate(self.user)
        self.client.post(f"/api/assignments/{a1.id}/reject/", {"comment": "не подходит"})
        self.client.force_authenticate(self.admin)
        self.client.post(f"/api/equipment/{eq.id}/assign/", {"mode": "mobile", "employee": self.emp.id})
        h = self.client.get(f"/api/equipment/{eq.id}/history/").json()
        # Две записи «Закрепление за сотрудником»: первая — отклонена, вторая — ждёт.
        zakr = [r for r in h if r.get("title") == "Закрепление за сотрудником"]
        self.assertEqual(len(zakr), 2)
        self.assertEqual(zakr[0]["acceptance"][0]["tone"], "pending")  # верхняя — новая
        self.assertEqual(zakr[1]["acceptance"][0]["tone"], "rejected")  # нижняя — прежняя
        # Служебный откат при отказе (сотрудник → склад) в истории не показан
        # (запись создания «— → склад» — легитимна, её не считаем).
        self.assertFalse(any(r.get("title") == "Размещение на место"
                             and str(self.emp) in (r.get("old") or "") for r in h))

    def test_reject_history_has_no_rollback_rows(self):
        eq = self._equip(place=self.storage)
        self._assign(eq, self.emp)
        a = open_assignment(eq)
        self.client.force_authenticate(self.user)
        self.client.post(f"/api/assignments/{a.id}/reject/", {"comment": "не подходит"})
        self.client.force_authenticate(self.admin)
        h = self.client.get(f"/api/equipment/{eq.id}/history/").json()
        # Ровно одна запись-движение закрепления (assign), без строк отката.
        emp_moves = [r for r in h if r.get("title") == "Закрепление за сотрудником"]
        self.assertEqual(len(emp_moves), 1)
        self.assertEqual(emp_moves[0]["new"], str(self.emp))
        self.assertEqual(emp_moves[0]["acceptance"], [{
            "text": f"Сотрудник отклонил закрепление, {eq.equipment_type.name} возвращено на "
                    f"Место хранения «{self.storage.name}» ({self.b.name} — {self.r.name}). Причина: не подходит",
            "tone": "rejected",
        }])

    def test_reject_requires_comment(self):
        eq = self._equip(place=self.storage)
        self._assign(eq, self.emp)
        a = open_assignment(eq)
        self.client.force_authenticate(self.user)
        resp = self.client.post(f"/api/assignments/{a.id}/reject/")
        self.assertEqual(resp.status_code, 400)
        a.refresh_from_db()
        self.assertEqual(a.status, EmployeeAssignment.Status.PENDING)  # не отклонено

    def test_only_owner_decides(self):
        other = User.objects.create_user(email="o@e.ru", password="Str0ng!Pass1", role=User.Role.ADMIN)
        eq = self._equip(place=self.storage)
        self._assign(eq, self.emp)
        a = open_assignment(eq)
        self.client.force_authenticate(other)
        resp = self.client.post(f"/api/assignments/{a.id}/accept/")
        self.assertEqual(resp.status_code, 403)


class CancelTests(AssignmentBaseTests):
    def test_reassign_before_decision_cancels_prior(self):
        emp_a = _emp(last="Первый")
        user_a = User.objects.create_user(email="a@e.ru", password="Str0ng!Pass1", employee=emp_a)
        emp_b = _emp(last="Второй")
        eq = self._equip(place=self.storage)
        self._assign(eq, emp_a)
        a1 = open_assignment(eq)
        self.assertEqual(a1.status, EmployeeAssignment.Status.PENDING)
        # Перезакрепляем за другим до решения A.
        self.client.post(f"/api/equipment/{eq.id}/assign/", {"mode": "mobile", "employee": emp_b.id})
        a1.refresh_from_db()
        self.assertEqual(a1.status, EmployeeAssignment.Status.CANCELLED)
        self.assertIsNotNone(a1.closed_at)
        # A больше не видит объект в «ожидающих» и не может принять.
        self.client.force_authenticate(user_a)
        self.assertEqual(self.client.get("/api/assignments/mine/").json(), [])
        resp = self.client.post(f"/api/assignments/{a1.id}/accept/")
        self.assertEqual(resp.status_code, 409)
        # История: у записи A — «Передача отменена ответственным».
        self.client.force_authenticate(self.admin)
        h = self.client.get(f"/api/equipment/{eq.id}/history/").json()
        a_moves = [r for r in h if r.get("title") == "Закрепление за сотрудником" and r.get("new") == str(emp_a)]
        self.assertEqual(a_moves[0]["acceptance"],
                         [{"text": "Передача отменена ответственным", "tone": "cancelled"}])

    def test_accepted_then_detached_keeps_accepted(self):
        emp = _emp()
        user = User.objects.create_user(email="acc@e.ru", password="Str0ng!Pass1", employee=emp)
        eq = self._equip(place=self.storage)
        self._assign(eq, emp)
        a = open_assignment(eq)
        self.client.force_authenticate(user)
        self.client.post(f"/api/assignments/{a.id}/accept/")
        # Открепление принятого — статус остаётся accepted (не cancelled).
        self.client.force_authenticate(self.admin)
        self.client.post(f"/api/equipment/{eq.id}/unassign/", {"place": self.storage.id})
        a.refresh_from_db()
        self.assertEqual(a.status, EmployeeAssignment.Status.ACCEPTED)


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
        self.client.post(f"/api/assignments/{a.id}/reject/", {"comment": "не подходит"})
        tr.refresh_from_db()
        self.assertIsNone(tr.employee_id)


class HistoryAcceptanceTests(AssignmentBaseTests):
    def test_created_assigned_equipment_splits_created_and_movement(self):
        emp = _emp()
        self.client.force_authenticate(self.admin)
        resp = self.client.post("/api/equipment/", {
            "inventory_number": "PC-H1", "equipment_type": self.eq_type.id, "employee": emp.id,
        }, format="json")
        self.assertEqual(resp.status_code, 201, resp.data)
        eq_id = resp.data["id"]
        h = self.client.get(f"/api/equipment/{eq_id}/history/").json()
        # «Объект создан» — без сотрудника и без акцепта (размещение — отдельно).
        created = next(r for r in h if r["kind"] == "created")
        self.assertIsNone(created.get("acceptance"))
        self.assertNotIn("Закреплённый сотрудник", [ln["label"] for ln in created.get("lines", [])])
        # Порядок: «Объект создан» — самая нижняя (старая) запись.
        self.assertEqual(h[-1]["kind"], "created")
        # Отдельная запись-движение закрепления со статусом акцепта.
        mv = next(r for r in h if r.get("title") == "Закрепление за сотрудником")
        self.assertEqual(mv["new"], str(emp))
        self.assertEqual(mv.get("acceptance"),
                         [{"text": "Заочно закреплено за сотрудником", "tone": "absentia"}])

    def test_tool_movement_shows_acceptance(self):
        emp = _emp()
        tool = Tool.objects.create(name="Дрель", quantity=5)
        ToolAllocation.objects.create(tool=tool, place=self.storage, quantity=5)
        self.client.force_authenticate(self.admin)
        self.client.post(f"/api/tools/{tool.id}/assign-units/",
                         {"mode": "mobile", "employee": emp.id, "quantity": 2, "from_place": self.storage.id})
        h = self.client.get(f"/api/tools/{tool.id}/history/").json()
        assign_row = next(r for r in h if r.get("acceptance"))
        self.assertIn("Заочно закреплено за сотрудником",
                      [a["text"] for a in assign_row["acceptance"]])

    def test_tool_reject_collapses_to_single_row(self):
        emp = _emp()
        user = User.objects.create_user(email="tw@e.ru", password="Str0ng!Pass1", employee=emp)
        tool = Tool.objects.create(name="Дрель", quantity=5)
        ToolAllocation.objects.create(tool=tool, place=self.storage, quantity=5)
        self.client.force_authenticate(self.admin)
        self.client.post(f"/api/tools/{tool.id}/assign-units/",
                         {"mode": "mobile", "employee": emp.id, "quantity": 2, "from_place": self.storage.id})
        a = open_assignment(tool)
        self.client.force_authenticate(user)
        self.client.post(f"/api/assignments/{a.id}/reject/", {"comment": "не подходит"})
        # Возврат вернул единицы на склад (баланс цел), но в истории — одна запись
        # ASSIGN со статусом «отклонил», без отдельной строки возврата.
        self.assertEqual(tool.allocations.filter(place=self.storage).first().quantity, 5)
        self.client.force_authenticate(self.admin)
        h = self.client.get(f"/api/tools/{tool.id}/history/").json()
        assigns = [r for r in h if r["label"].startswith("Закреплено:")]
        unassigns = [r for r in h if r["label"].startswith("Откреплено:")]
        self.assertEqual(len(assigns), 1)
        self.assertEqual(len(unassigns), 0)  # возврат-по-отказу скрыт
        self.assertEqual(assigns[0]["acceptance"][0]["tone"], "rejected")


class PlacementCollapseTests(AssignmentBaseTests):
    def test_unassign_employee_to_place_is_single_row(self):
        # Создаём на складе, закрепляем за сотрудником, затем открепляем на склад.
        eq = self._equip(place=self.storage)
        self._assign(eq, _emp(last="Иванов"))
        self.client.force_authenticate(self.admin)
        self.client.post(f"/api/equipment/{eq.id}/unassign/", {"place": self.storage.id})
        h = self.client.get(f"/api/equipment/{eq.id}/history/").json()
        # Верхняя запись — открепление сотрудника на место, ОДНОЙ строкой.
        top = h[0]
        self.assertEqual(top["title"], "Размещение на место")
        self.assertIn("Иванов", top["old"])
        self.assertIn(self.storage.name, top["new"])
        # Нет отдельной строки «Размещение: Не размещено → …» с прежним форматом.
        self.assertFalse(any(r.get("label") == "Размещение" and r.get("title") is None
                             and r["category"] == "movement" for r in h))

    def test_assign_from_place_titled_zakreplenie(self):
        eq = self._equip(place=self.storage)
        self._assign(eq, _emp(last="Петров"))
        h = self.client.get(f"/api/equipment/{eq.id}/history/").json()
        top = h[0]
        self.assertEqual(top["title"], "Закрепление за сотрудником")
        self.assertIn(self.storage.name, top["old"])
        self.assertIn("Петров", top["new"])


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
