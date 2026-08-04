"""Общие сериализаторы/миксины для разделов, где объект закреплён за
сотрудником (SIM-карты, пропуска, оборудование, транспорт, инструменты)."""
from rest_framework import serializers

from storage.serializers import StoredFileSerializer


def serialize_type_files(type_files):
    """B67. Единый формат ``[{id, file}]`` для файлов Вида имущества
    (наследников core.models.TypeFileBase). Используется и для библиотеки Вида
    (в ``*TypeSerializer``), и для выбранных на экземпляре файлов (в
    сериализаторе имущества). ``type_files`` — уже прогретый итерируемый набор
    (prefetch), файлы без бинарника (stored_file=NULL) отбрасываются."""
    return [
        {"id": tf.id, "file": StoredFileSerializer(tf.stored_file).data}
        for tf in type_files
        if tf.stored_file_id
    ]


def validate_storage_place(place, field="storage_place"):
    """Общий валидатор размещения (B53-R4): свободный объект лежит на складе.

    Если `place` задан — он обязан быть Местом типа STORAGE (склад); иначе
    поднимается DRF ValidationError на поле `field` с единым сообщением.
    `None` допустим (объект размещён у сотрудника/в оборудовании или ещё без
    размещения). Раньше эта проверка была продублирована дословно в
    сериализаторах SIM-карт, пропусков, лицензий и инструментов (у последних —
    на поле `place`), поэтому вынесена рядом с EmployeeHolderSerializerMixin."""
    # Лениво — как в остальных сериализаторах: избегаем импорта locations на
    # уровне модуля (core/serializers импортируется доменными приложениями).
    from locations.models import Place

    if place is not None and place.place_type != Place.PlaceType.STORAGE:
        raise serializers.ValidationError({field: "Выберите место хранения (склад)."})


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
