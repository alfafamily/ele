"""Каскадное архивирование/возврат из архива.

Архивирование идёт по одному объекту (не bulk .update()), чтобы каждое
изменение попадало в историю (django-simple-history). Возврат из архива —
всегда по одному узлу; вложенные при этом остаются в архиве (их возвращают
отдельно), а поднять узел под архивным родителем нельзя (проверка во view).
"""


def _archive(obj):
    if not obj.is_archived:
        obj.is_archived = True
        obj.save(update_fields=["is_archived"])


def archive_building(building):
    _archive(building)
    for room in building.rooms.all():
        archive_room(room)


def archive_room(room):
    _archive(room)
    for place in room.places.all():
        _archive(place)


def archive_place(place):
    _archive(place)


def unarchive(obj):
    if obj.is_archived:
        obj.is_archived = False
        obj.save(update_fields=["is_archived"])
