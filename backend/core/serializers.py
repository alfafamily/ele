"""Общие сериализаторы/миксины для разделов, где объект закреплён за
сотрудником (SIM-карты, пропуска, оборудование, транспорт, инструменты)."""
from storage.serializers import StoredFileSerializer


def place_detail(place):
    """Краткое описание Места для карточек/списков (склад/рабочее место)."""
    if place is None:
        return None
    return {
        "id": place.id,
        "name": place.name,
        "place_type": place.place_type,
        "room_name": place.room.name,
        "building_name": place.room.building.name,
    }


class EmployeeHolderSerializerMixin:
    """Геттеры для SerializerMethodField, читающие закреплённого сотрудника.

    Опирается только на `obj.employee` / `obj.acceptance_status` / `obj.storage_place`,
    поэтому не зависит от конкретной модели. Подмешивается в сериализаторы, которые
    объявляют соответствующие SerializerMethodField (`employee_name`, `employee_avatar`,
    `position`, `department`, `acceptance_status`, `storage_place_detail`); лишние
    методы, для которых нет одноимённого поля, DRF просто не вызывает.

    Разделы с особой логикой (например «Инструменты» с репрезентативным статусом
    акцепта размещения) переопределяют нужный геттер в своём сериализаторе."""

    def get_employee_name(self, obj):
        return str(obj.employee) if obj.employee_id else None

    def get_employee_avatar(self, obj):
        if obj.employee_id and obj.employee.avatar_id:
            return StoredFileSerializer(obj.employee.avatar).data
        return None

    def get_position(self, obj):
        return obj.employee.position if obj.employee_id else None

    def get_department(self, obj):
        return obj.employee.department if obj.employee_id else None

    def get_acceptance_status(self, obj):
        # B32: статус акцепта из аннотации queryset списка (None в detail).
        return getattr(obj, "acceptance_status", None)

    def get_storage_place_detail(self, obj):
        return place_detail(obj.storage_place) if obj.storage_place_id else None
