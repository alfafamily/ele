"""Запись значений динамических реквизитов Типа (EAV) — общая для
equipment.EquipmentFieldValue и licenses.LicenseFieldValue: одинаковая схема
(value_text/bool/int/float/file), одинаковая логика по типу значения.

Файловые реквизиты сюда не пишутся — отдельный multipart-эндпоинт на
каждый реквизит (см. equipment/licenses views), полноценно это уедет на
StoredFile в Фазе 5.
"""
from rest_framework import serializers


def apply_field_values(instance, fk_name: str, field_value_model, items: list[dict], allowed_fields) -> None:
    """items: [{"field": <TypeField instance>, "value": <any>}]
    allowed_fields: queryset/итерируемое реквизитов, допустимых для Типа этого объекта."""
    allowed_ids = {f.pk for f in allowed_fields}
    errors = []
    for item in items:
        field = item["field"]
        if field.pk not in allowed_ids:
            errors.append(f"Реквизит «{field.name}» не относится к выбранному Типу.")
            continue
        value = item.get("value")
        defaults = {"value_text": None, "value_bool": None, "value_int": None, "value_float": None}
        if field.value_type == "text":
            defaults["value_text"] = None if value is None else str(value)
        elif field.value_type == "bool":
            if value is not None and not isinstance(value, bool):
                errors.append(f"«{field.name}»: ожидается булево значение.")
                continue
            defaults["value_bool"] = value
        elif field.value_type == "int":
            try:
                defaults["value_int"] = None if value is None else int(value)
            except (TypeError, ValueError):
                errors.append(f"«{field.name}»: ожидается целое число.")
                continue
        elif field.value_type == "float":
            try:
                defaults["value_float"] = None if value is None else float(value)
            except (TypeError, ValueError):
                errors.append(f"«{field.name}»: ожидается дробное число.")
                continue
        elif field.value_type == "file":
            # Файлы — только через отдельный upload-эндпоинт, не JSON-payload.
            continue
        field_value_model.objects.update_or_create(**{fk_name: instance, "field": field}, defaults=defaults)
    if errors:
        raise serializers.ValidationError({"field_values": errors})


def upsert_custom_fields(instance, model, fk_name: str, items: list[dict]) -> None:
    """Обновляет «Дополнительные поля» объекта по id: существующие —
    обновляются (только при реальном изменении), новые — создаются,
    отсутствующие — удаляются. Стабильная идентичность нужна, чтобы «История
    изменений» (§5.8) фиксировала правки полей, а не delete-all + recreate."""
    existing = {cf.id: cf for cf in instance.custom_fields.all()}
    seen = set()
    for item in items:
        cf_id = item.get("id")
        name = item.get("name", "") or ""
        value = item.get("value", "") or ""
        if cf_id and cf_id in existing:
            # Наименование поля неизменяемо после создания — обновляем только
            # значение (см. UI: у сохранённого поля имя заблокировано).
            cf = existing[cf_id]
            if cf.value != value:
                cf.value = value
                cf.save(update_fields=["value"])
            seen.add(cf_id)
        else:
            model.objects.create(**{fk_name: instance, "name": name, "value": value})
    for cf_id, cf in existing.items():
        if cf_id not in seen:
            cf.delete()


def missing_required_fields(instance, value_related_name: str, type_fields) -> list:
    """Список обязательных реквизитов Типа без заполненного значения у объекта
    (для валидации при создании/редактировании — исключение: списание/утилизация, §5.4)."""
    values = {fv.field_id: fv for fv in getattr(instance, value_related_name).all()}
    missing = []
    for field in type_fields.filter(is_required=True):
        fv = values.get(field.pk)
        if fv is None or is_value_empty(fv, field.value_type):
            missing.append(field)
    return missing


def is_value_empty(field_value, value_type: str) -> bool:
    if value_type == "file":
        return not field_value.value_file
    value = getattr(field_value, f"value_{value_type}")
    return value is None or value == ""


def count_missing_for_field(objects_qs, field, value_related_name: str) -> int:
    """Сколько объектов из objects_qs не имеют заполненного значения для field
    (§5.4/T3 — предупреждение при переводе реквизита в обязательный задним
    числом). Масштаб проекта (≤2000 объектов, ТЗ §7.1) — простой цикл достаточен."""
    count = 0
    for obj in objects_qs:
        fv = getattr(obj, value_related_name).filter(field=field).first()
        if fv is None or is_value_empty(fv, field.value_type):
            count += 1
    return count
