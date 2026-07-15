from django.test import TestCase

from .models import Building, Place, Room
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
