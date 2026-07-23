from django.db.models import Exists, OuterRef, Q


def eav_req_conditions(params, *, value_model, field_model, object_fk, type_field):
    """B27. Список Q-условий фильтра по EAV-реквизитам из query-параметров вида
    ``req_<fieldId>=<значение>`` (Оборудование/Лицензии — фильтр по реквизитам
    выбранных Типов).

    Каждое условие — ``Exists``-подзапрос по нужному значению реквизита,
    гейтованный по «своему» типу объекта: у объекта другого типа этого реквизита
    нет, поэтому для него условие не действует (``~Q(type=...)``). Так фильтр по
    реквизиту типа A не отсеивает объекты выбранного типа B. Несколько реквизитов
    складываются вызывающим кодом через AND (отдельные ``.filter()``).

    Параметры:
      value_model  — модель значения EAV (EquipmentFieldValue / LicenseFieldValue);
      field_model  — модель реквизита типа (EquipmentTypeField / LicenseTypeField);
      object_fk    — имя FK на объект в value_model ('equipment' / 'license');
      type_field   — имя FK на Тип у объекта и у field_model
                     ('equipment_type' / 'license_type').

    Файловые реквизиты не фильтруются; некорректные значения тихо пропускаются.
    """
    conds = []
    prefix = "req_"
    for key, raw in params.items():
        if not key.startswith(prefix):
            continue
        val = (raw or "").strip()
        if not val:
            continue
        try:
            field_id = int(key[len(prefix):])
        except ValueError:
            continue
        field = field_model.objects.filter(pk=field_id).first()
        if field is None:
            continue

        lookup = {object_fk: OuterRef("pk"), "field_id": field_id}
        value_type = field.value_type
        if value_type == "bool":
            low = val.lower()
            if low in ("true", "1", "да"):
                lookup["value_bool"] = True
            elif low in ("false", "0", "нет"):
                lookup["value_bool"] = False
            else:
                continue
        elif value_type == "int":
            try:
                lookup["value_int"] = int(val)
            except ValueError:
                continue
        elif value_type == "float":
            try:
                lookup["value_float"] = float(val)
            except ValueError:
                continue
        elif value_type == "text":
            lookup["value_text__icontains"] = val
        elif value_type == "list":
            lookup["value_text"] = val
        else:
            # file — не фильтруем.
            continue

        exists = Exists(value_model.objects.filter(**lookup))
        gate = ~Q(**{f"{type_field}_id": getattr(field, f"{type_field}_id")})
        conds.append(exists | gate)
    return conds


def csv_ids(param):
    """Разобрать query-параметр «id через запятую» в список непустых строк.
    Пустая строка/None → пустой список (фильтр не применяется)."""
    return [v for v in (param or "").split(",") if v]
