"""Инструменты — количественный учёт (B8: остаток лежит на складах): приход/
списание единиц со склада, раздача сотруднику/рабочему месту, возврат на склад,
несколько складов, списание всей карточки, карточка сотрудника."""

from accounts.models import User
from employees.models import Employee
from locations.models import Building, Place, Room
from rest_framework.test import APITestCase

from .models import Tool, ToolAllocation


class ToolTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=self.admin)
        self.emp_a = Employee.objects.create(first_name="Иван", last_name="Иванов")
        self.emp_b = Employee.objects.create(first_name="Пётр", last_name="Петров")
        b = Building.objects.create(name="Главное")
        r = Room.objects.create(building=b, name="101")
        self.store1 = Place.objects.create(room=r, name="Склад-1", place_type=Place.PlaceType.STORAGE)
        self.store2 = Place.objects.create(room=r, name="Склад-2", place_type=Place.PlaceType.STORAGE)
        self.wp = Place.objects.create(room=r, name="РМ-1", place_type=Place.PlaceType.WORKPLACE)

    def _make(self, name="Отвёртка", quantity=10, custom=None, place="store1"):
        payload = {"name": name, "quantity": quantity}
        if quantity and place is not None:
            payload["place"] = getattr(self, place).id
        if custom:
            payload["custom_fields"] = custom
        resp = self.client.post("/api/tools/", payload, format="json")
        self.assertEqual(resp.status_code, 201, resp.data)
        return resp.data

    def _post(self, tid, action, **body):
        return self.client.post(f"/api/tools/{tid}/{action}/", body, format="json")

    def test_create_with_name_and_stock(self):
        data = self._make(quantity=10)
        self.assertEqual(data["name"], "Отвёртка")
        self.assertEqual(data["quantity"], 10)
        self.assertEqual(data["free"], 10)
        self.assertEqual(data["allocated"], 0)
        # Начальный остаток лёг на выбранный склад.
        storage = [a for a in data["allocations"] if a["kind"] == "storage"]
        self.assertEqual(len(storage), 1)
        self.assertEqual(storage[0]["quantity"], 10)

    def test_create_without_storage_ok(self):
        # Склад необязателен — остаток становится свободным без склада.
        resp = self.client.post("/api/tools/", {"name": "X", "quantity": 5}, format="json")
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data["free"], 5)
        self.assertEqual(resp.data["free_unplaced"], 5)

    def test_create_zero_stock_no_storage_ok(self):
        resp = self.client.post("/api/tools/", {"name": "X", "quantity": 0}, format="json")
        self.assertEqual(resp.status_code, 201, resp.data)

    def test_operations_on_unplaced_free(self):
        # Кейс обновлённого инстанса: остаток без склада можно списывать, выдавать
        # сотруднику и на рабочее место без указания склада.
        tid = self.client.post("/api/tools/", {"name": "Y", "quantity": 10}, format="json").data["id"]
        r = self._post(tid, "write-off-units", quantity=2)  # без склада
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data["quantity"], 8)
        r = self._post(tid, "assign-units", employee=self.emp_a.id, quantity=3)  # без склада
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data["allocated"], 3)
        r = self._post(tid, "assign-units", mode="stationary", place=self.wp.id, quantity=1)
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data["allocated"], 4)
        self.assertEqual(r.data["free"], 4)
        self.assertEqual(r.data["free_unplaced"], 4)
        # Возврат без склада — снова в свободный без склада.
        r = self._post(tid, "unassign-units", employee=self.emp_a.id, quantity=3)
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data["free_unplaced"], 7)

    def test_write_off_more_than_unplaced_rejected(self):
        tid = self.client.post("/api/tools/", {"name": "Z", "quantity": 3}, format="json").data["id"]
        r = self._post(tid, "write-off-units", quantity=4)
        self.assertEqual(r.status_code, 409, r.data)

    def test_name_required(self):
        resp = self.client.post("/api/tools/", {"name": "", "quantity": 1}, format="json")
        self.assertEqual(resp.status_code, 400, resp.data)

    def test_custom_fields(self):
        data = self._make(custom=[{"name": "Артикул", "value": "A-1"}])
        self.assertEqual(data["custom_fields"][0]["value"], "A-1")

    def test_add_and_write_off_units(self):
        tid = self._make(quantity=10)["id"]
        r = self._post(tid, "add-units", quantity=5, place=self.store1.id, comment="поставка")
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data["quantity"], 15)
        r = self._post(tid, "write-off-units", quantity=3, place=self.store1.id)
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data["quantity"], 12)

    def test_add_to_second_warehouse(self):
        tid = self._make(quantity=10)["id"]
        r = self._post(tid, "add-units", quantity=4, place=self.store2.id)
        self.assertEqual(r.status_code, 200, r.data)
        storages = {a["place"]: a["quantity"] for a in r.data["allocations"] if a["kind"] == "storage"}
        self.assertEqual(storages[self.store1.id], 10)
        self.assertEqual(storages[self.store2.id], 4)

    def test_write_off_more_than_on_warehouse_rejected(self):
        tid = self._make(quantity=5)["id"]
        r = self._post(tid, "write-off-units", quantity=6, place=self.store1.id)
        self.assertEqual(r.status_code, 409, r.data)

    def test_assign_unassign_employee(self):
        tid = self._make(quantity=10)["id"]
        r = self._post(tid, "assign-units", employee=self.emp_a.id, from_place=self.store1.id, quantity=3)
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data["allocated"], 3)
        self.assertEqual(r.data["free"], 7)
        r = self._post(tid, "assign-units", employee=self.emp_b.id, from_place=self.store1.id, quantity=5)
        self.assertEqual(r.data["allocated"], 8)
        self.assertEqual(r.data["free"], 2)
        # Возврат на другой склад.
        r = self._post(tid, "unassign-units", employee=self.emp_a.id, to_place=self.store2.id, quantity=3)
        self.assertEqual(r.status_code, 200, r.data)
        self.assertFalse(ToolAllocation.objects.filter(tool_id=tid, employee=self.emp_a).exists())
        self.assertEqual(r.data["allocated"], 5)
        storages = {a["place"]: a["quantity"] for a in r.data["allocations"] if a["kind"] == "storage"}
        self.assertEqual(storages.get(self.store2.id), 3)

    def test_assign_to_workplace(self):
        tid = self._make(quantity=10)["id"]
        r = self._post(tid, "assign-units", mode="stationary", place=self.wp.id, from_place=self.store1.id, quantity=4)
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data["allocated"], 4)
        wp_alloc = [a for a in r.data["allocations"] if a["kind"] == "workplace"]
        self.assertEqual(wp_alloc[0]["quantity"], 4)
        r = self._post(tid, "unassign-units", mode="stationary", place=self.wp.id, to_place=self.store1.id, quantity=4)
        self.assertEqual(r.data["allocated"], 0)

    def test_assign_more_than_on_warehouse_rejected(self):
        tid = self._make(quantity=4)["id"]
        r = self._post(tid, "assign-units", employee=self.emp_a.id, from_place=self.store1.id, quantity=5)
        self.assertEqual(r.status_code, 409, r.data)

    def test_employee_card_shows_tool(self):
        tid = self._make(quantity=10)["id"]
        self._post(tid, "assign-units", employee=self.emp_a.id, from_place=self.store1.id, quantity=3)
        resp = self.client.get(f"/api/employees/{self.emp_a.id}/")
        self.assertEqual(resp.status_code, 200, resp.data)
        entry = resp.data["tools"][0]
        self.assertEqual(entry["quantity"], 3)
        self.assertEqual(entry["name"], "Отвёртка")

    def test_terminate_returns_tools(self):
        tid = self._make(quantity=10)["id"]
        self._post(tid, "assign-units", employee=self.emp_a.id, from_place=self.store1.id, quantity=4)
        resp = self.client.post(f"/api/employees/{self.emp_a.id}/terminate/", {}, format="json")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data["detached_tool_count"], 1)
        self.assertFalse(ToolAllocation.objects.filter(tool_id=tid, employee=self.emp_a).exists())
        self.assertEqual(Tool.objects.get(pk=tid).quantity, 10)

    def test_write_off_whole_card(self):
        tid = self._make(quantity=10)["id"]
        self._post(tid, "assign-units", employee=self.emp_a.id, from_place=self.store1.id, quantity=4)
        r = self._post(tid, "write-off", comment="акт")
        self.assertEqual(r.status_code, 200, r.data)
        tool = Tool.objects.get(pk=tid)
        self.assertTrue(tool.is_written_off)
        self.assertEqual(tool.quantity, 0)
        self.assertFalse(ToolAllocation.objects.filter(tool_id=tid).exists())
        r = self._post(tid, "add-units", quantity=1, place=self.store1.id)
        self.assertEqual(r.status_code, 409, r.data)

    def test_history(self):
        tid = self._make(quantity=10)["id"]
        self._post(tid, "add-units", quantity=5, place=self.store1.id, comment="приход")
        self._post(tid, "assign-units", employee=self.emp_a.id, from_place=self.store1.id, quantity=2)
        self._post(tid, "write-off", comment="")
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
        self._post(tid, "assign-units", employee=self.emp_a.id, from_place=self.store1.id, quantity=2)
        r = self.client.delete(f"/api/employees/{self.emp_a.id}/")
        self.assertEqual(r.status_code, 409, r.data)

    def test_transfer_between_warehouses(self):
        tid = self._make(quantity=10)["id"]  # весь остаток на store1
        r = self._post(tid, "transfer-units", from_place=self.store1.id, to_place=self.store2.id, quantity=4)
        self.assertEqual(r.status_code, 200, r.data)
        storages = {a["place"]: a["quantity"] for a in r.data["allocations"] if a["kind"] == "storage"}
        self.assertEqual(storages[self.store1.id], 6)
        self.assertEqual(storages[self.store2.id], 4)

    def test_transfer_more_than_source_rejected(self):
        tid = self._make(quantity=5)["id"]
        r = self._post(tid, "transfer-units", from_place=self.store1.id, to_place=self.store2.id, quantity=6)
        self.assertEqual(r.status_code, 409, r.data)

    def test_transfer_same_warehouse_rejected(self):
        tid = self._make(quantity=5)["id"]
        r = self._post(tid, "transfer-units", from_place=self.store1.id, to_place=self.store1.id, quantity=1)
        self.assertEqual(r.status_code, 400, r.data)
