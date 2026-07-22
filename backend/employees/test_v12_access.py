"""Тесты релиза 1.2.0: ключи (тип объекта), статус «Утилизировано» у средств
доступа и SIM, комментарии/движения в истории."""

from accounts.models import User
from locations.models import Building, Place, Room
from rest_framework.test import APITestCase

from .models import AccessPass, Employee, SimCard


class AccessPassKeyTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=self.admin)
        # Объект доступа выбирается только с флагом «Требуется ключ/пропуск» (B15) —
        # на всех уровнях: здание, помещение, место.
        self.b1 = Building.objects.create(name="Корпус А", requires_pass=True)
        self.b2 = Building.objects.create(name="Корпус Б", requires_pass=True)
        self.r1 = Room.objects.create(building=self.b1, name="101", requires_pass=True)
        # Место с флагом «Требуется ключ/пропуск» — доступно для выбора; без флага — нет.
        self.p1 = Place.objects.create(room=self.r1, name="Сейф", requires_pass=True)
        self.p_plain = Place.objects.create(room=self.r1, name="Стол", requires_pass=False)

    def test_key_requires_single_building(self):
        resp = self.client.post("/api/access-passes/", {
            "object_type": "key",
            "building_ids": [self.b1.id, self.b2.id],
        }, format="json")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("building_ids", resp.data.get("errors", resp.data))

    def test_key_created_with_single_room(self):
        resp = self.client.post("/api/access-passes/", {
            "object_type": "key",
            "account_number": "K-1",
            "building_ids": [self.b1.id],
            "room_ids": [self.r1.id],
        }, format="json")
        self.assertEqual(resp.status_code, 201, resp.data)
        ap = AccessPass.objects.get(pk=resp.data["id"])
        self.assertEqual(ap.object_type, "key")
        self.assertEqual(list(ap.rooms.all()), [self.r1])

    def test_pass_allows_multiple_buildings(self):
        resp = self.client.post("/api/access-passes/", {
            "object_type": "pass",
            "building_ids": [self.b1.id, self.b2.id],
        }, format="json")
        self.assertEqual(resp.status_code, 201, resp.data)

    def test_pass_with_flagged_place(self):
        resp = self.client.post("/api/access-passes/", {
            "object_type": "pass",
            "building_ids": [self.b1.id],
            "place_ids": [self.p1.id],
        }, format="json")
        self.assertEqual(resp.status_code, 201, resp.data)
        ap = AccessPass.objects.get(pk=resp.data["id"])
        self.assertEqual(list(ap.places.all()), [self.p1])

    def test_pass_place_without_flag_rejected(self):
        resp = self.client.post("/api/access-passes/", {
            "object_type": "pass",
            "building_ids": [self.b1.id],
            "place_ids": [self.p_plain.id],
        }, format="json")
        # Место без флага не входит в queryset place_ids → ошибка выбора.
        self.assertEqual(resp.status_code, 400)
        self.assertIn("place_ids", resp.data.get("errors", resp.data))

    def test_place_must_belong_to_selected_building(self):
        resp = self.client.post("/api/access-passes/", {
            "object_type": "pass",
            "building_ids": [self.b2.id],
            "place_ids": [self.p1.id],
        }, format="json")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("place_ids", resp.data.get("errors", resp.data))

    def test_key_targets_single_place(self):
        resp = self.client.post("/api/access-passes/", {
            "object_type": "key",
            "building_ids": [self.b1.id],
            "place_ids": [self.p1.id],
        }, format="json")
        self.assertEqual(resp.status_code, 201, resp.data)
        ap = AccessPass.objects.get(pk=resp.data["id"])
        self.assertEqual(list(ap.places.all()), [self.p1])

    def test_key_rejects_room_and_place_together(self):
        resp = self.client.post("/api/access-passes/", {
            "object_type": "key",
            "building_ids": [self.b1.id],
            "room_ids": [self.r1.id],
            "place_ids": [self.p1.id],
        }, format="json")
        self.assertEqual(resp.status_code, 400)

    # B15: объект доступа выбирается только среди зданий/помещений с флагом.
    def test_building_without_flag_rejected(self):
        b_plain = Building.objects.create(name="Без флага", requires_pass=False)
        resp = self.client.post("/api/access-passes/", {
            "object_type": "pass",
            "building_ids": [b_plain.id],
        }, format="json")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("building_ids", resp.data.get("errors", resp.data))

    def test_room_without_flag_rejected(self):
        r_plain = Room.objects.create(building=self.b1, name="Без флага", requires_pass=False)
        resp = self.client.post("/api/access-passes/", {
            "object_type": "pass",
            "building_ids": [self.b1.id],
            "room_ids": [r_plain.id],
        }, format="json")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("room_ids", resp.data.get("errors", resp.data))

    def test_pass_with_flagged_room(self):
        resp = self.client.post("/api/access-passes/", {
            "object_type": "pass",
            "building_ids": [self.b1.id],
            "room_ids": [self.r1.id],
        }, format="json")
        self.assertEqual(resp.status_code, 201, resp.data)

    def test_unflagged_building_as_container_for_place(self):
        # Здание и помещение без флага, но место требует ключ/пропуск: пропуск на
        # это место создаётся — здание/помещение выступают лишь контейнерами (B15).
        b3 = Building.objects.create(name="Корпус В", requires_pass=False)
        r3 = Room.objects.create(building=b3, name="301", requires_pass=False)
        p3 = Place.objects.create(room=r3, name="Сейф-3", requires_pass=True)
        resp = self.client.post("/api/access-passes/", {
            "object_type": "pass",
            "building_ids": [b3.id],
            "place_ids": [p3.id],
        }, format="json")
        self.assertEqual(resp.status_code, 201, resp.data)
        ap = AccessPass.objects.get(pk=resp.data["id"])
        self.assertEqual(list(ap.places.all()), [p3])


class UtilizeTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=self.admin)
        self.emp = Employee.objects.create(first_name="Иван", last_name="Петров")
        self.b1 = Building.objects.create(name="Корпус А")

    def test_pass_utilize_handed_sets_status_and_detaches(self):
        ap = AccessPass.objects.create(object_type="pass", employee=self.emp)
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
        ap = AccessPass.objects.create(object_type="pass")
        ap.buildings.add(self.b1)
        resp = self.client.post(f"/api/access-passes/{ap.id}/utilize/", {"reason": "nope"}, format="json")
        self.assertEqual(resp.status_code, 400)

    def test_utilized_pass_in_utilized_tab_only(self):
        ap = AccessPass.objects.create(object_type="pass")
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
        self.r1 = Room.objects.create(building=self.b1, name="К1")
        self.store = Place.objects.create(room=self.r1, name="Склад", place_type=Place.PlaceType.STORAGE)
        self.sim = SimCard.objects.create(phone_number="+70000000002", employee=self.emp)
        self.ap = AccessPass.objects.create(object_type="pass", employee=self.emp)
        self.ap.buildings.add(self.b1)

    def test_terminate_with_per_item_actions(self):
        # SIM утилизируется (склад не нужен), пропуск открепляется на склад.
        resp = self.client.post(f"/api/employees/{self.emp.id}/terminate/", {
            "sim_actions": {str(self.sim.id): {"action": "utilized", "comment": "с"}},
            "pass_actions": {str(self.ap.id): {"action": "detach", "storage_place": self.store.id}},
        }, format="json")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.sim.refresh_from_db()
        self.ap.refresh_from_db()
        self.assertTrue(self.sim.is_utilized)
        self.assertFalse(self.ap.is_utilized)
        self.assertIsNone(self.ap.employee_id)  # откреплён
        self.assertEqual(self.ap.storage_place_id, self.store.id)
        self.assertEqual(resp.data["utilized_sim_count"], 1)
        self.assertEqual(resp.data["deactivated_pass_count"], 1)


class HistoryTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=self.admin)
        self.b1 = Building.objects.create(name="Корпус А", requires_pass=True)

    def test_creation_comment_and_fields_in_history(self):
        resp = self.client.post("/api/access-passes/", {
            "object_type": "pass",
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
        self.assertEqual(labels.get("Учётный номер"), "AP-1")
        # Набор доступа (здания/помещения/места) — в записи создания.
        self.assertEqual(labels.get("Здания"), "Корпус А")

    def test_created_history_lists_rooms_and_places(self):
        room = Room.objects.create(building=self.b1, name="К-101", requires_pass=True)
        place = Place.objects.create(room=room, name="Сейф", requires_pass=True)
        resp = self.client.post("/api/access-passes/", {
            "object_type": "key",
            "building_ids": [self.b1.id],
            "place_ids": [place.id],
        }, format="json")
        self.assertEqual(resp.status_code, 201, resp.data)
        rows = self.client.get(f"/api/access-passes/{resp.data['id']}/history/").data
        created = [r for r in rows if r["kind"] == "created"][0]
        labels = {ln["label"]: ln["value"] for ln in created["lines"]}
        self.assertEqual(labels.get("Здания"), "Корпус А")
        # Место показывается с помещением-родителем.
        self.assertEqual(labels.get("Места"), "Сейф (К-101)")

    def test_m2m_access_change_appears_in_history(self):
        from datetime import timedelta

        from django.utils import timezone

        b2 = Building.objects.create(name="Корпус Б", requires_pass=True)
        resp = self.client.post("/api/access-passes/", {
            "object_type": "pass", "building_ids": [self.b1.id],
        }, format="json")
        pid = resp.data["id"]
        ap = AccessPass.objects.get(pk=pid)
        # Отодвигаем создание в прошлое, чтобы правка не попала в «окно создания».
        ap.history.all().update(history_date=timezone.now() - timedelta(minutes=5))
        # Меняем набор зданий (добавляем второе).
        self.client.patch(f"/api/access-passes/{pid}/", {"building_ids": [self.b1.id, b2.id]}, format="json")
        rows = self.client.get(f"/api/access-passes/{pid}/history/").data
        changed = [r for r in rows if r["kind"] == "changed" and r["label"] == "Здания"]
        self.assertTrue(changed, rows)
        self.assertEqual(changed[0]["old"], "Корпус А")
        self.assertIn("Корпус Б", changed[0]["new"])

    def test_utilize_is_movement_with_reason_label(self):
        ap = AccessPass.objects.create(object_type="pass")
        ap.buildings.add(self.b1)
        self.client.post(f"/api/access-passes/{ap.id}/utilize/", {"reason": "handed", "comment": "к"}, format="json")
        rows = self.client.get(f"/api/access-passes/{ap.id}/history/").data
        movements = [r for r in rows if r.get("kind") == "movement"]
        self.assertTrue(any(r["label"] == "Передан арендодателю" and r["comment"] == "к" for r in movements))
