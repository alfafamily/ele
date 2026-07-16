"""Тесты релиза 1.2.0: ключи (тип объекта), статус «Утилизировано» у средств
доступа и SIM, комментарии/движения в истории."""

from accounts.models import User
from locations.models import Building, Room
from rest_framework.test import APITestCase

from .models import AccessPass, Employee, SimCard


class AccessPassKeyTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=self.admin)
        self.b1 = Building.objects.create(name="Корпус А")
        self.b2 = Building.objects.create(name="Корпус Б")
        self.r1 = Room.objects.create(building=self.b1, name="101")

    def test_key_requires_single_building(self):
        resp = self.client.post("/api/access-passes/", {
            "object_type": "key",
            "building_ids": [self.b1.id, self.b2.id],
        }, format="json")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("building_ids", resp.data.get("errors", resp.data))

    def test_key_created_clears_name(self):
        resp = self.client.post("/api/access-passes/", {
            "object_type": "key",
            "name": "должно очиститься",
            "account_number": "K-1",
            "building_ids": [self.b1.id],
            "room_ids": [self.r1.id],
        }, format="json")
        self.assertEqual(resp.status_code, 201, resp.data)
        ap = AccessPass.objects.get(pk=resp.data["id"])
        self.assertEqual(ap.object_type, "key")
        self.assertEqual(ap.name, "")
        self.assertEqual(list(ap.rooms.all()), [self.r1])

    def test_pass_allows_multiple_buildings(self):
        resp = self.client.post("/api/access-passes/", {
            "object_type": "pass",
            "name": "Осн. пропуск",
            "building_ids": [self.b1.id, self.b2.id],
        }, format="json")
        self.assertEqual(resp.status_code, 201, resp.data)


class UtilizeTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=self.admin)
        self.emp = Employee.objects.create(first_name="Иван", last_name="Петров")
        self.b1 = Building.objects.create(name="Корпус А")

    def test_pass_utilize_handed_sets_status_and_detaches(self):
        ap = AccessPass.objects.create(object_type="pass", name="P1", employee=self.emp)
        ap.buildings.add(self.b1)
        resp = self.client.post(f"/api/access-passes/{ap.id}/utilize/", {
            "reason": "handed", "comment": "передан арендодателю",
        }, format="json")
        self.assertEqual(resp.status_code, 200, resp.data)
        ap.refresh_from_db()
        self.assertTrue(ap.is_utilized)
        self.assertEqual(ap.utilization_reason, "handed")
        self.assertIsNone(ap.employee_id)
        self.assertFalse(ap.is_deactivated)  # утилизированный ≠ неиспользуемый

    def test_pass_utilize_bad_reason_rejected(self):
        ap = AccessPass.objects.create(object_type="pass", name="P1")
        ap.buildings.add(self.b1)
        resp = self.client.post(f"/api/access-passes/{ap.id}/utilize/", {"reason": "nope"}, format="json")
        self.assertEqual(resp.status_code, 400)

    def test_utilized_pass_in_utilized_tab_only(self):
        ap = AccessPass.objects.create(object_type="pass", name="P1")
        ap.buildings.add(self.b1)
        self.client.post(f"/api/access-passes/{ap.id}/utilize/", {"reason": "utilized"}, format="json")
        utilized = self.client.get("/api/access-passes/?tab=utilized").data["results"]
        unused = self.client.get("/api/access-passes/?tab=deactivated").data["results"]
        self.assertEqual([p["id"] for p in utilized], [ap.id])
        self.assertEqual(unused, [])

    def test_sim_utilize(self):
        sim = SimCard.objects.create(phone_number="+70000000001", employee=self.emp)
        resp = self.client.post(f"/api/sim-cards/{sim.id}/utilize/", {"comment": "выброшена"}, format="json")
        self.assertEqual(resp.status_code, 200, resp.data)
        sim.refresh_from_db()
        self.assertTrue(sim.is_utilized)
        self.assertIsNone(sim.employee_id)


class TerminateDispositionTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=self.admin)
        self.emp = Employee.objects.create(first_name="Иван", last_name="Петров")
        self.b1 = Building.objects.create(name="Корпус А")
        self.sim = SimCard.objects.create(phone_number="+70000000002", employee=self.emp)
        self.ap = AccessPass.objects.create(object_type="pass", name="P1", employee=self.emp)
        self.ap.buildings.add(self.b1)

    def test_terminate_with_per_item_actions(self):
        resp = self.client.post(f"/api/employees/{self.emp.id}/terminate/", {
            "sim_actions": {str(self.sim.id): {"action": "utilized", "comment": "с"}},
            "pass_actions": {str(self.ap.id): {"action": "detach"}},
        }, format="json")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.sim.refresh_from_db()
        self.ap.refresh_from_db()
        self.assertTrue(self.sim.is_utilized)
        self.assertFalse(self.ap.is_utilized)
        self.assertIsNone(self.ap.employee_id)  # откреплён
        self.assertEqual(resp.data["utilized_sim_count"], 1)
        self.assertEqual(resp.data["deactivated_pass_count"], 1)


class HistoryTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=self.admin)
        self.b1 = Building.objects.create(name="Корпус А")

    def test_creation_comment_and_fields_in_history(self):
        resp = self.client.post("/api/access-passes/", {
            "object_type": "pass",
            "name": "Пропуск-1",
            "account_number": "AP-1",
            "building_ids": [self.b1.id],
            "comment": "получен на складе",
        }, format="json")
        self.assertEqual(resp.status_code, 201, resp.data)
        rows = self.client.get(f"/api/access-passes/{resp.data['id']}/history/").data
        created = [r for r in rows if r["kind"] == "created"]
        self.assertEqual(len(created), 1)
        self.assertEqual(created[0]["category"], "movement")
        self.assertEqual(created[0]["comment"], "получен на складе")
        labels = {ln["label"]: ln["value"] for ln in created[0]["lines"]}
        self.assertEqual(labels.get("Название"), "Пропуск-1")
        self.assertEqual(labels.get("Учётный номер"), "AP-1")

    def test_utilize_is_movement_with_reason_label(self):
        ap = AccessPass.objects.create(object_type="pass", name="P1")
        ap.buildings.add(self.b1)
        self.client.post(f"/api/access-passes/{ap.id}/utilize/", {"reason": "handed", "comment": "к"}, format="json")
        rows = self.client.get(f"/api/access-passes/{ap.id}/history/").data
        movements = [r for r in rows if r.get("kind") == "movement"]
        self.assertTrue(any(r["label"] == "Передан арендодателю" and r["comment"] == "к" for r in movements))
