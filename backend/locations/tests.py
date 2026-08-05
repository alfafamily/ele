from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from rest_framework.test import APITestCase

from accounts.models import User

from .models import Building, Place, Room
from .serializers import PlaceSerializer, RoomSerializer
from .sorting import room_sort_key


class RoomSortKeyTests(TestCase):
    def _rooms(self, building, floors):
        return [Room.objects.create(building=building, name=f"R{i}", floor=f) for i, f in enumerate(floors)]

    def test_order_desc_by_numeric_floor_then_alpha(self):
        b = Building.objects.create(name="Здание")
        self._rooms(b, ["5", "4", "3", "1А", "1Б", "-1P", ""])
        ordered = [r.floor for r in sorted(b.rooms.all(), key=room_sort_key)]
        # Числовая часть по убыванию; при равной — буквенная А→Я; пустой этаж в конце.
        self.assertEqual(ordered, ["5", "4", "3", "1А", "1Б", "-1P", ""])

    def test_negative_floor_below_zero(self):
        b = Building.objects.create(name="Здание")
        self._rooms(b, ["-1 Паркинг", "1", "2"])
        ordered = [r.floor for r in sorted(b.rooms.all(), key=room_sort_key)]
        self.assertEqual(ordered, ["2", "1", "-1 Паркинг"])

    def test_adjacent_parking_sorts_first(self):
        b = Building.objects.create(name="Здание")
        Room.objects.create(building=b, name="5-й этаж", floor="5")
        Room.objects.create(building=b, name="Гостевая парковка", parking_type="adjacent")
        Room.objects.create(building=b, name="Подземный паркинг", floor="-1", parking_type="floor")
        ordered = [r.name for r in sorted(b.rooms.all(), key=room_sort_key)]
        # Прилегающая парковка всегда первой, дальше — по этажам (5 выше -1).
        self.assertEqual(ordered, ["Гостевая парковка", "5-й этаж", "Подземный паркинг"])


class ParkingRoomSerializerTests(TestCase):
    def setUp(self):
        self.b = Building.objects.create(name="Здание")

    def test_floor_parking_requires_floor(self):
        s = RoomSerializer(data={"building": self.b.id, "name": "Паркинг", "parking_type": "floor", "floor": ""})
        self.assertFalse(s.is_valid())
        self.assertIn("floor", s.errors)

    def test_adjacent_parking_clears_floor(self):
        s = RoomSerializer(data={"building": self.b.id, "name": "Гостевая", "parking_type": "adjacent", "floor": "3"})
        self.assertTrue(s.is_valid(), s.errors)
        self.assertEqual(s.validated_data["floor"], "")

    def test_floor_parking_unique_per_building(self):
        Room.objects.create(building=self.b, name="П1", parking_type="floor", floor="-1")
        s = RoomSerializer(data={"building": self.b.id, "name": "П2", "parking_type": "floor", "floor": "-1"})
        self.assertFalse(s.is_valid())
        self.assertIn("floor", s.errors)
        # Тот же этаж в другом здании — можно.
        b2 = Building.objects.create(name="Здание 2")
        s2 = RoomSerializer(data={"building": b2.id, "name": "П3", "parking_type": "floor", "floor": "-1"})
        self.assertTrue(s2.is_valid(), s2.errors)

    def test_normal_rooms_may_share_floor(self):
        # Условная уникальность не должна мешать обычным помещениям делить этаж.
        Room.objects.create(building=self.b, name="Каб 101", floor="1")
        s = RoomSerializer(data={"building": self.b.id, "name": "Каб 102", "floor": "1"})
        self.assertTrue(s.is_valid(), s.errors)


class ParkingSpotSerializerTests(TestCase):
    def setUp(self):
        from employees.models import Employee
        from transport.models import Transport, TransportType

        self.b = Building.objects.create(name="Здание")
        self.parking = Room.objects.create(building=self.b, name="Паркинг", parking_type="adjacent")
        self.office = Room.objects.create(building=self.b, name="Офис")
        self.emp = Employee.objects.create(first_name="Иван", last_name="Иванов")
        self.emp2 = Employee.objects.create(first_name="Пётр", last_name="Петров")
        ttype = TransportType.objects.create(name="Легковой")
        self.car = Transport.objects.create(inventory_number="TR-1", transport_type=ttype)
        self.car2 = Transport.objects.create(inventory_number="TR-2", transport_type=ttype)

    def _valid(self, data):
        return PlaceSerializer(data=data)

    def test_parking_spot_only_in_parking_room(self):
        s = self._valid({"room": self.office.id, "name": "М1", "place_type": "parking_spot"})
        self.assertFalse(s.is_valid())
        self.assertIn("place_type", s.errors)

    def test_workplace_not_in_parking_room(self):
        s = self._valid({"room": self.parking.id, "name": "РМ", "place_type": "workplace"})
        self.assertFalse(s.is_valid())
        self.assertIn("place_type", s.errors)

    def test_parking_spot_personal_and_company_mutually_exclusive(self):
        s = self._valid({
            "room": self.parking.id, "name": "М1", "place_type": "parking_spot",
            "employees": [self.emp.id], "transport": [self.car.id],
        })
        self.assertFalse(s.is_valid())

    def test_parking_spot_company_transport_ok(self):
        s = self._valid({
            "room": self.parking.id, "name": "М1", "place_type": "parking_spot",
            "transport": [self.car.id],
        })
        self.assertTrue(s.is_valid(), s.errors)

    def test_parking_spot_at_most_one_employee(self):
        s = self._valid({
            "room": self.parking.id, "name": "М1", "place_type": "parking_spot",
            "employees": [self.emp.id, self.emp2.id],
        })
        self.assertFalse(s.is_valid())
        self.assertIn("employees", s.errors)

    def test_parking_spot_at_most_one_transport(self):
        s = self._valid({
            "room": self.parking.id, "name": "М1", "place_type": "parking_spot",
            "transport": [self.car.id, self.car2.id],
        })
        self.assertFalse(s.is_valid())
        self.assertIn("transport", s.errors)

    def test_transport_rejected_on_workplace(self):
        s = self._valid({
            "room": self.office.id, "name": "РМ", "place_type": "workplace",
            "transport": [self.car.id],
        })
        self.assertFalse(s.is_valid())
        self.assertIn("transport", s.errors)


class LocationViewSetTests(APITestCase):
    """B42. HTTP-слой справочника помещений: архивирование/возврат с проверкой
    иерархии (нельзя вернуть ребёнка при архивном родителе), загрузка/удаление
    плана парковки, плоский список мест с фильтрами по типу и размещению."""

    def setUp(self):
        self.admin = User.objects.create_superuser(email="loc-admin@e.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=self.admin)
        self.building = Building.objects.create(name="БЦ")
        self.room = Room.objects.create(building=self.building, name="Каб 1")
        self.parking = Room.objects.create(building=self.building, name="Паркинг", parking_type="adjacent")
        self.store = Place.objects.create(room=self.room, name="Склад", place_type=Place.PlaceType.STORAGE)
        self.wp = Place.objects.create(room=self.room, name="РМ", place_type=Place.PlaceType.WORKPLACE)
        self.spot = Place.objects.create(room=self.parking, name="М1", place_type=Place.PlaceType.PARKING_SPOT)

    # --- архив/возврат по иерархии -----------------------------------------
    def test_building_archive_and_unarchive_roundtrip(self):
        self.assertEqual(self.client.post(f"/api/buildings/{self.building.id}/archive/").status_code, 200)
        self.building.refresh_from_db()
        self.assertTrue(self.building.is_archived)
        # Список по умолчанию скрывает архивные; ?include_archived=1 — показывает.
        active = [b["id"] for b in self.client.get("/api/buildings/").data]
        self.assertNotIn(self.building.id, active)
        with_arch = [b["id"] for b in self.client.get("/api/buildings/?include_archived=1").data]
        self.assertIn(self.building.id, with_arch)
        self.assertEqual(self.client.post(f"/api/buildings/{self.building.id}/unarchive/").status_code, 200)
        self.building.refresh_from_db()
        self.assertFalse(self.building.is_archived)

    def test_room_unarchive_blocked_while_building_archived(self):
        self.client.post(f"/api/buildings/{self.building.id}/archive/")  # каскад вниз
        r = self.client.post(f"/api/rooms/{self.room.id}/unarchive/")
        self.assertEqual(r.status_code, 409, r.data)

    def test_place_unarchive_blocked_while_room_archived(self):
        self.client.post(f"/api/rooms/{self.room.id}/archive/")
        r = self.client.post(f"/api/places/{self.store.id}/unarchive/")
        self.assertEqual(r.status_code, 409, r.data)

    def test_place_archive_unarchive_when_parents_active(self):
        self.assertEqual(self.client.post(f"/api/places/{self.store.id}/archive/").status_code, 200)
        self.assertEqual(self.client.post(f"/api/places/{self.store.id}/unarchive/").status_code, 200)

    def test_destroy_forbidden(self):
        self.assertEqual(self.client.delete(f"/api/buildings/{self.building.id}/").status_code, 405)
        self.assertEqual(self.client.delete(f"/api/rooms/{self.room.id}/").status_code, 405)
        self.assertEqual(self.client.delete(f"/api/places/{self.store.id}/").status_code, 405)

    # --- план парковки ------------------------------------------------------
    def test_plan_upload_delete_on_parking(self):
        img = SimpleUploadedFile("plan.png", b"img-bytes", content_type="image/png")
        r = self.client.post(f"/api/rooms/{self.parking.id}/plan/", {"file": img}, format="multipart")
        self.assertEqual(r.status_code, 200, r.data)
        self.parking.refresh_from_db()
        self.assertIsNotNone(self.parking.plan_file_id)
        # Повторная загрузка заменяет прежний файл.
        img2 = SimpleUploadedFile("plan2.pdf", b"%PDF-1.4", content_type="application/pdf")
        self.assertEqual(
            self.client.post(f"/api/rooms/{self.parking.id}/plan/", {"file": img2}, format="multipart").status_code, 200
        )
        # Удаление плана.
        self.assertEqual(self.client.delete(f"/api/rooms/{self.parking.id}/plan/").status_code, 200)
        self.parking.refresh_from_db()
        self.assertIsNone(self.parking.plan_file_id)

    def test_plan_rejected_on_non_parking_room(self):
        img = SimpleUploadedFile("plan.png", b"img", content_type="image/png")
        r = self.client.post(f"/api/rooms/{self.room.id}/plan/", {"file": img}, format="multipart")
        self.assertEqual(r.status_code, 400, r.data)

    def test_plan_requires_file_and_valid_content_type(self):
        self.assertEqual(self.client.post(f"/api/rooms/{self.parking.id}/plan/", {}, format="multipart").status_code, 400)
        bad = SimpleUploadedFile("x.txt", b"text", content_type="text/plain")
        r = self.client.post(f"/api/rooms/{self.parking.id}/plan/", {"file": bad}, format="multipart")
        self.assertEqual(r.status_code, 400, r.data)

    def test_plan_delete_when_absent_is_noop(self):
        # DELETE без ранее загруженного плана не падает.
        self.assertEqual(self.client.delete(f"/api/rooms/{self.parking.id}/plan/").status_code, 200)

    # --- плоский список мест + фильтры --------------------------------------
    def test_place_list_filter_by_type_and_active(self):
        Place.objects.create(room=self.room, name="АрхСклад", place_type=Place.PlaceType.STORAGE, is_archived=True)
        storages = self.client.get("/api/places/?place_type=storage").data
        names = {p["name"] for p in storages}
        self.assertIn("Склад", names)
        self.assertNotIn("РМ", names)
        active = {p["name"] for p in self.client.get("/api/places/?place_type=storage&active=1").data}
        self.assertNotIn("АрхСклад", active)

    def test_place_list_filter_has_equipment_type(self):
        from equipment.models import Equipment, EquipmentType
        etype = EquipmentType.objects.create(name="ПК")
        Equipment.objects.create(inventory_number="EQ-1", equipment_type=etype, place=self.store)
        ids = [p["id"] for p in self.client.get(f"/api/places/?has_equipment_type={etype.id}").data]
        self.assertIn(self.store.id, ids)
        self.assertNotIn(self.wp.id, ids)


class ArchiveCascadeTests(TestCase):
    def test_archive_building_cascades(self):
        from . import service

        b = Building.objects.create(name="Здание")
        r = Room.objects.create(building=b, name="Каб 1")
        p = Place.objects.create(room=r, name="РМ-1")
        service.archive_building(b)
        r.refresh_from_db()
        p.refresh_from_db()
        self.assertTrue(b.is_archived and r.is_archived and p.is_archived)
