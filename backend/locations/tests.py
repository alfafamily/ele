from django.test import TestCase

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
        ttype = TransportType.objects.create(name="Легковой")
        self.car = Transport.objects.create(inventory_number="TR-1", transport_type=ttype)

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

    def test_transport_rejected_on_workplace(self):
        s = self._valid({
            "room": self.office.id, "name": "РМ", "place_type": "workplace",
            "transport": [self.car.id],
        })
        self.assertFalse(s.is_valid())
        self.assertIn("transport", s.errors)


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
