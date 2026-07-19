"""B6 — количественный учёт оборудования: остаток, приход/списание единиц,
закрепление/открепление по частям, списание всей карточки, увольнение и архив."""

from accounts.models import User
from employees.models import Employee
from rest_framework.test import APITestCase

from .models import Equipment, EquipmentAllocation, EquipmentMovement, EquipmentType


class QuantityAccountingTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=self.admin)
        self.emp_a = Employee.objects.create(first_name="Иван", last_name="Иванов")
        self.emp_b = Employee.objects.create(first_name="Пётр", last_name="Петров")

    def _make_quantity_type(self, name="Мышь"):
        resp = self.client.post(
            "/api/equipment-types/", {"name": name, "accounting_type": "quantity"}, format="json"
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data["accounting_type"], "quantity")
        return resp.data["id"]

    def _make_card(self, type_id, inv="MOUSE-1", quantity=10):
        resp = self.client.post(
            "/api/equipment/",
            {"inventory_number": inv, "equipment_type": type_id, "quantity": quantity},
            format="json",
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        return resp.data

    # ——— базовое ———

    def test_default_accounting_type_is_instance(self):
        resp = self.client.post("/api/equipment-types/", {"name": "Ноутбук"}, format="json")
        self.assertEqual(resp.data["accounting_type"], "instance")

    def test_create_with_initial_stock(self):
        t = self._make_quantity_type()
        data = self._make_card(t, quantity=10)
        self.assertEqual(data["quantity"], 10)
        self.assertEqual(data["free"], 10)
        self.assertEqual(data["allocated"], 0)
        self.assertEqual(data["accounting_type"], "quantity")

    def test_instance_type_ignores_quantity(self):
        resp = self.client.post("/api/equipment-types/", {"name": "Ноутбук"}, format="json")
        t = resp.data["id"]
        model_field = next(f["id"] for f in resp.data["fields"] if f["name"] == "Модель")
        resp = self.client.post(
            "/api/equipment/",
            {
                "inventory_number": "NB-1",
                "equipment_type": t,
                "quantity": 99,
                "field_values_input": [{"field": model_field, "value": "X"}],
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data["quantity"], 0)

    # ——— приход / списание единиц ———

    def test_add_and_write_off_units(self):
        t = self._make_quantity_type()
        card = self._make_card(t, quantity=10)
        cid = card["id"]

        resp = self.client.post(f"/api/equipment/{cid}/add-units/", {"quantity": 5, "comment": "поставка"}, format="json")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data["quantity"], 15)
        self.assertEqual(resp.data["free"], 15)

        resp = self.client.post(f"/api/equipment/{cid}/write-off-units/", {"quantity": 3}, format="json")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data["quantity"], 12)

        # Движения записаны.
        kinds = list(EquipmentMovement.objects.filter(equipment_id=cid).values_list("kind", flat=True))
        self.assertIn("add", kinds)
        self.assertIn("write_off", kinds)

    def test_write_off_more_than_free_rejected(self):
        t = self._make_quantity_type()
        cid = self._make_card(t, quantity=5)["id"]
        resp = self.client.post(f"/api/equipment/{cid}/write-off-units/", {"quantity": 6}, format="json")
        self.assertEqual(resp.status_code, 409, resp.data)
        self.assertEqual(Equipment.objects.get(pk=cid).quantity, 5)

    def test_quantity_op_rejected_for_instance_type(self):
        resp = self.client.post("/api/equipment-types/", {"name": "Ноутбук"}, format="json")
        t = resp.data["id"]
        model_field = next(f["id"] for f in resp.data["fields"] if f["name"] == "Модель")
        resp = self.client.post(
            "/api/equipment/",
            {"inventory_number": "NB-2", "equipment_type": t, "field_values_input": [{"field": model_field, "value": "X"}]},
            format="json",
        )
        cid = resp.data["id"]
        resp = self.client.post(f"/api/equipment/{cid}/add-units/", {"quantity": 1}, format="json")
        self.assertEqual(resp.status_code, 409, resp.data)

    # ——— закрепление / открепление по частям ———

    def test_assign_and_unassign_units_multiple_employees(self):
        t = self._make_quantity_type()
        cid = self._make_card(t, quantity=10)["id"]

        resp = self.client.post(f"/api/equipment/{cid}/assign-units/", {"employee": self.emp_a.id, "quantity": 3}, format="json")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data["allocated"], 3)
        self.assertEqual(resp.data["free"], 7)

        resp = self.client.post(f"/api/equipment/{cid}/assign-units/", {"employee": self.emp_b.id, "quantity": 5}, format="json")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data["allocated"], 8)
        self.assertEqual(resp.data["free"], 2)
        self.assertEqual(len(resp.data["allocations"]), 2)

        # Открепить часть у A.
        resp = self.client.post(f"/api/equipment/{cid}/unassign-units/", {"employee": self.emp_a.id, "quantity": 2}, format="json")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data["allocated"], 6)
        self.assertEqual(resp.data["free"], 4)

        # Открепить остаток у A — закрепление удаляется.
        resp = self.client.post(f"/api/equipment/{cid}/unassign-units/", {"employee": self.emp_a.id, "quantity": 1}, format="json")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertFalse(EquipmentAllocation.objects.filter(equipment_id=cid, employee=self.emp_a).exists())
        self.assertEqual(resp.data["allocated"], 5)

    def test_assign_more_than_free_rejected(self):
        t = self._make_quantity_type()
        cid = self._make_card(t, quantity=4)["id"]
        resp = self.client.post(f"/api/equipment/{cid}/assign-units/", {"employee": self.emp_a.id, "quantity": 5}, format="json")
        self.assertEqual(resp.status_code, 409, resp.data)

    def test_unassign_more_than_held_rejected(self):
        t = self._make_quantity_type()
        cid = self._make_card(t, quantity=10)["id"]
        self.client.post(f"/api/equipment/{cid}/assign-units/", {"employee": self.emp_a.id, "quantity": 3}, format="json")
        resp = self.client.post(f"/api/equipment/{cid}/unassign-units/", {"employee": self.emp_a.id, "quantity": 4}, format="json")
        self.assertEqual(resp.status_code, 409, resp.data)

    # ——— карточка сотрудника ———

    def test_employee_card_shows_quantity_allocation(self):
        t = self._make_quantity_type()
        cid = self._make_card(t, quantity=10)["id"]
        self.client.post(f"/api/equipment/{cid}/assign-units/", {"employee": self.emp_a.id, "quantity": 3}, format="json")
        resp = self.client.get(f"/api/employees/{self.emp_a.id}/")
        self.assertEqual(resp.status_code, 200, resp.data)
        entry = next(e for e in resp.data["equipment"] if e.get("is_quantity"))
        self.assertEqual(entry["quantity"], 3)

    def test_terminate_returns_allocations(self):
        t = self._make_quantity_type()
        cid = self._make_card(t, quantity=10)["id"]
        self.client.post(f"/api/equipment/{cid}/assign-units/", {"employee": self.emp_a.id, "quantity": 4}, format="json")
        resp = self.client.post(f"/api/employees/{self.emp_a.id}/terminate/", {}, format="json")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data["detached_allocation_count"], 1)
        self.assertFalse(EquipmentAllocation.objects.filter(equipment_id=cid).exists())
        # Единицы вернулись в свободный пул.
        self.assertEqual(Equipment.objects.get(pk=cid).quantity, 10)

    # ——— списание всей карточки ———

    def test_write_off_whole_card_clears_allocations(self):
        t = self._make_quantity_type()
        cid = self._make_card(t, quantity=10)["id"]
        self.client.post(f"/api/equipment/{cid}/assign-units/", {"employee": self.emp_a.id, "quantity": 4}, format="json")
        resp = self.client.post(f"/api/equipment/{cid}/write-off/", {"comment": "списано"}, format="json")
        self.assertEqual(resp.status_code, 200, resp.data)
        card = Equipment.objects.get(pk=cid)
        self.assertTrue(card.is_written_off)
        self.assertEqual(card.quantity, 0)
        self.assertFalse(EquipmentAllocation.objects.filter(equipment_id=cid).exists())
        # После списания unit-операции недоступны.
        resp = self.client.post(f"/api/equipment/{cid}/add-units/", {"quantity": 1}, format="json")
        self.assertEqual(resp.status_code, 409, resp.data)

    def test_write_off_whole_card_history_shows_total(self):
        t = self._make_quantity_type()
        cid = self._make_card(t, quantity=10)["id"]
        self.client.post(f"/api/equipment/{cid}/assign-units/", {"employee": self.emp_a.id, "quantity": 4}, format="json")
        self.client.post(f"/api/equipment/{cid}/write-off/", {"comment": "акт"}, format="json")
        # Закрепление откреплено; отдельного ledger-движения «Списание» нет —
        # списанное количество показывается строкой «Списано: N шт.».
        kinds = list(EquipmentMovement.objects.filter(equipment_id=cid).values_list("kind", flat=True))
        self.assertIn("unassign", kinds)
        self.assertNotIn("write_off", kinds)
        labels = [r["label"] for r in self.client.get(f"/api/equipment/{cid}/history/").data]
        self.assertIn("Списано: 10 шт.", labels)

    # ——— учётный номер ———

    def test_quantity_card_without_inventory_number(self):
        t = self._make_quantity_type()
        resp = self.client.post("/api/equipment/", {"equipment_type": t, "quantity": 5}, format="json")
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data["inventory_number"], "")

    def test_quantity_card_ignores_passed_inventory_number(self):
        t = self._make_quantity_type()
        resp = self.client.post(
            "/api/equipment/", {"inventory_number": "SHOULD-IGNORE", "equipment_type": t, "quantity": 5}, format="json"
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data["inventory_number"], "")

    def test_two_quantity_cards_without_number_allowed(self):
        t = self._make_quantity_type()
        r1 = self.client.post("/api/equipment/", {"equipment_type": t, "quantity": 1}, format="json")
        r2 = self.client.post("/api/equipment/", {"equipment_type": t, "quantity": 2}, format="json")
        self.assertEqual(r1.status_code, 201, r1.data)
        self.assertEqual(r2.status_code, 201, r2.data)

    def test_instance_still_requires_inventory_number(self):
        resp = self.client.post("/api/equipment-types/", {"name": "Ноутбук"}, format="json")
        t = resp.data["id"]
        model_field = next(f["id"] for f in resp.data["fields"] if f["name"] == "Модель")
        resp = self.client.post(
            "/api/equipment/",
            {"equipment_type": t, "field_values_input": [{"field": model_field, "value": "X"}]},
            format="json",
        )
        self.assertEqual(resp.status_code, 400, resp.data)

    # ——— смена вида учёта ———

    def test_cannot_change_accounting_type_with_objects(self):
        t = self._make_quantity_type()
        self._make_card(t, quantity=3)
        resp = self.client.patch(f"/api/equipment-types/{t}/", {"accounting_type": "instance"}, format="json")
        self.assertEqual(resp.status_code, 400, resp.data)

    def test_can_change_accounting_type_without_objects(self):
        t = self._make_quantity_type()
        resp = self.client.patch(f"/api/equipment-types/{t}/", {"accounting_type": "instance"}, format="json")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data["accounting_type"], "instance")

    # ——— история движений ———

    def test_history_contains_movements(self):
        t = self._make_quantity_type()
        cid = self._make_card(t, quantity=10)["id"]
        self.client.post(f"/api/equipment/{cid}/add-units/", {"quantity": 5, "comment": "приход"}, format="json")
        self.client.post(f"/api/equipment/{cid}/assign-units/", {"employee": self.emp_a.id, "quantity": 2}, format="json")
        resp = self.client.get(f"/api/equipment/{cid}/history/")
        self.assertEqual(resp.status_code, 200, resp.data)
        labels = [r["label"] for r in resp.data]
        self.assertTrue(any("Приход: +5 шт." in ln for ln in labels))
        self.assertTrue(any("Закреплено: 2 шт." in ln for ln in labels))
        # Начальный остаток — в записи создания.
        created = next(r for r in resp.data if r["kind"] == "created")
        self.assertTrue(any(ln["label"] == "Начальный остаток" for ln in created["lines"]))
