"""Хелперы размещения объектов (B8).

Единая точка получения/валидации Места нужного типа для действий закрепления/
открепления Оборудования, Инструментов, SIM и пропусков. Возвращают Place или
поднимают DRF ValidationError (→ 400) с человекочитаемым сообщением.
"""

from rest_framework.exceptions import ValidationError

from locations.models import Place


def get_place(pk, *, place_type=None, field="place", missing_msg=None, wrong_type_msg=None):
    """Достаёт активное (не архивное) Место по id. Если задан place_type —
    проверяет соответствие типа. Ошибки — как ValidationError на поле `field`."""
    if pk in (None, ""):
        raise ValidationError({field: missing_msg or "Укажите место."})
    place = Place.objects.filter(pk=pk).first()
    if place is None:
        raise ValidationError({field: "Место не найдено."})
    if place.is_archived:
        raise ValidationError({field: "Место в архиве — недоступно для размещения."})
    if place_type and place.place_type != place_type:
        raise ValidationError({field: wrong_type_msg or "Неподходящий тип места."})
    return place


def get_storage_place(pk, field="storage_place"):
    """Место хранения (склад) — куда кладётся свободный объект/остаток."""
    return get_place(
        pk, place_type=Place.PlaceType.STORAGE, field=field,
        missing_msg="Укажите место хранения.",
        wrong_type_msg="Выберите место хранения (склад).",
    )


def get_workplace(pk, field="place"):
    """Рабочее место — стационарное размещение (без конкретного сотрудника)."""
    return get_place(
        pk, place_type=Place.PlaceType.WORKPLACE, field=field,
        missing_msg="Укажите рабочее место.",
        wrong_type_msg="Выберите рабочее место.",
    )
