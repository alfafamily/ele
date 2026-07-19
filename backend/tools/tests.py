"""Инструменты — количественный учёт: остаток, приход/списание единиц,
закрепление/открепление по частям, списание всей карточки, карточка сотрудника."""

from accounts.models import User
from employees.models import Employee
from rest_framework.test import APITestCase

from .models import Tool, ToolAllocation, ToolMovement


class ToolTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=self.admin)
        self.emp_a = Employee.objects.create(first_name="Иван", last_name="Иванов")
        self.emp_b = Employee.objects.create(first_name="Пётр", last_name="Петров")

    def _make(self, name="Отвёртка", quantity=10, custom=None):
        payload = {"name": name, "quantity": quantity}
        if custom:
            payload["custom_fields"] = custom
        resp = self.client.post("/api/tools/", payload, format="json")
        self.assertEqual(resp.status_code, 201, resp.data)
        return resp.data

    def test_create_with_name_and_stock(self):
        data = self._make(quantity=10)
        self.assertEqual(data["name"], "Отвёртка")
        self.assertEqual(data["quantity"], 10)
        self.assertEqual(data["free"], 10)
        self.assertEqual(data["allocated"], 0)

    def test_name_required(self):
        resp = self.client.post("/api/tools/", {"name": "", "quantity": 1}, format="json")
        self.assertEqual(resp.status_code, 400, resp.data)

    def test_custom_fields(self):
        data = self._make(custom=[{"name": "Артикул", "value": "A-1"}])
        self.assertEqual(len(data["custom_fields"]), 1)
        self.assertEqual(data["custom_fields"][0]["value"], "A-1")

    def test_add_and_write_off_units(self):
        tid = self._make(quantity=10)["id"]
        r = self.client.post(f"/api/tools/{tid}/add-units/", {"quantity": 5, "comment": "поставка"}, format="json")
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data["quantity"], 15)
        r = self.client.post(f"/api/tools/{tid}/write-off-units/", {"quantity": 3}, format="json")
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data["quantity"], 12)

    def test_write_off_more_than_free_rejected(self):
        tid = self._make(quantity=5)["id"]
        r = self.client.post(f"/api/tools/{tid}/write-off-units/", {"quantity": 6}, format="json")
        self.assertEqual(r.status_code, 409, r.data)

    def test_assign_unassign_multiple_employees(self):
        tid = self._make(quantity=10)["id"]
        r = self.client.post(f"/api/tools/{tid}/assign-units/", {"employee": self.emp_a.id, "quantity": 3}, format="json")
        self.assertEqual(r.data["allocated"], 3)
        r = self.client.post(f"/api/tools/{tid}/assign-units/", {"employee": self.emp_b.id, "quantity": 5}, format="json")
        self.assertEqual(r.data["allocated"], 8)
        self.assertEqual(r.data["free"], 2)
        self.assertEqual(len(r.data["allocations"]), 2)
        r = self.client.post(f"/api/tools/{tid}/unassign-units/", {"employee": self.emp_a.id, "quantity": 3}, format="json")
        self.assertFalse(ToolAllocation.objects.filter(tool_id=tid, employee=self.emp_a).exists())
        self.assertEqual(r.data["allocated"], 5)

    def test_assign_more_than_free_rejected(self):
        tid = self._make(quantity=4)["id"]
        r = self.client.post(f"/api/tools/{tid}/assign-units/", {"employee": self.emp_a.id, "quantity": 5}, format="json")
        self.assertEqual(r.status_code, 409, r.data)

    def test_employee_card_shows_tool(self):
        tid = self._make(quantity=10)["id"]
        self.client.post(f"/api/tools/{tid}/assign-units/", {"employee": self.emp_a.id, "quantity": 3}, format="json")
        resp = self.client.get(f"/api/employees/{self.emp_a.id}/")
        self.assertEqual(resp.status_code, 200, resp.data)
        entry = next(t for t in resp.data["tools"])
        self.assertEqual(entry["quantity"], 3)
        self.assertEqual(entry["name"], "Отвёртка")

    def test_terminate_returns_tools(self):
        tid = self._make(quantity=10)["id"]
        self.client.post(f"/api/tools/{tid}/assign-units/", {"employee": self.emp_a.id, "quantity": 4}, format="json")
        resp = self.client.post(f"/api/employees/{self.emp_a.id}/terminate/", {}, format="json")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data["detached_tool_count"], 1)
        self.assertFalse(ToolAllocation.objects.filter(tool_id=tid).exists())
        self.assertEqual(Tool.objects.get(pk=tid).quantity, 10)

    def test_write_off_whole_card(self):
        tid = self._make(quantity=10)["id"]
        self.client.post(f"/api/tools/{tid}/assign-units/", {"employee": self.emp_a.id, "quantity": 4}, format="json")
        r = self.client.post(f"/api/tools/{tid}/write-off/", {"comment": "акт"}, format="json")
        self.assertEqual(r.status_code, 200, r.data)
        tool = Tool.objects.get(pk=tid)
        self.assertTrue(tool.is_written_off)
        self.assertEqual(tool.quantity, 0)
        self.assertFalse(ToolAllocation.objects.filter(tool_id=tid).exists())
        # После списания операции недоступны.
        r = self.client.post(f"/api/tools/{tid}/add-units/", {"quantity": 1}, format="json")
        self.assertEqual(r.status_code, 409, r.data)

    def test_history(self):
        tid = self._make(quantity=10)["id"]
        self.client.post(f"/api/tools/{tid}/add-units/", {"quantity": 5, "comment": "приход"}, format="json")
        self.client.post(f"/api/tools/{tid}/assign-units/", {"employee": self.emp_a.id, "quantity": 2}, format="json")
        self.client.post(f"/api/tools/{tid}/write-off/", {}, format="json")
        labels = [r["label"] for r in self.client.get(f"/api/tools/{tid}/history/").data]
        self.assertTrue(any("Приход: +5 шт." in ln for ln in labels))
        self.assertTrue(any("Закреплено: 2 шт." in ln for ln in labels))
        self.assertIn("Списано: 15 шт.", labels)

    def test_no_delete(self):
        tid = self._make()["id"]
        r = self.client.delete(f"/api/tools/{tid}/")
        self.assertEqual(r.status_code, 405, r.data)

    def test_employee_delete_blocked_by_tool(self):
        tid = self._make(quantity=5)["id"]
        self.client.post(f"/api/tools/{tid}/assign-units/", {"employee": self.emp_a.id, "quantity": 2}, format="json")
        r = self.client.delete(f"/api/employees/{self.emp_a.id}/")
        self.assertEqual(r.status_code, 409, r.data)
