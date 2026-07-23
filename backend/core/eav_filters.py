import json

from django.db.models import Exists, OuterRef, Q


def _parse_req_values(raw):
    """Значения реквизита-фильтра приходят JSON-массивом (устойчиво к запятым/
    спецсимволам в тексте): req_<id>=["зн1","зн2"]. Пустое/битое → []."""
    if not raw:
        return []
    try:
        values = json.loads(raw)
    except (ValueError, TypeError):
        # Обратная совместимость: одиночное значение строкой.
        values = [raw]
    if not isinstance(values, list):
        values = [values]
    return [v for v in values if v not in (None, "")]


def _bool_values(values):
    out = []
    for v in values:
        s = str(v).strip().lower()
        if s in ("true", "1", "да"):
            out.append(True)
        elif s in ("false", "0", "нет"):
            out.append(False)
    return out


def _num_values(values, cast):
    out = []
    for v in values:
        try:
            out.append(cast(v))
        except (ValueError, TypeError):
            pass
    return out


def eav_req_conditions(params, *, value_model, field_model, object_fk, type_field):
    """B27. Список Q-условий фильтра по EAV-реквизитам из query-параметров вида
    ``req_<fieldId>=["зн1","зн2"]`` (Оборудование/Лицензии — фильтр по реквизитам
    выбранных Типов). Несколько значений одного реквизита — ИЛИ (``__in``).

    Каждое условие — ``Exists``-подзапрос по значениям реквизита, гейтованный по
    «своему» типу объекта: у объекта другого типа этого реквизита нет, поэтому
    для него условие не действует (``~Q(type=...)``). Так фильтр по реквизиту
    типа A не отсеивает объекты выбранного типа B. Несколько реквизитов
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
        values = _parse_req_values(raw)
        if not values:
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
            bools = _bool_values(values)
            if not bools:
                continue
            lookup["value_bool__in"] = bools
        elif value_type == "int":
            ints = _num_values(values, int)
            if not ints:
                continue
            lookup["value_int__in"] = ints
        elif value_type == "float":
            floats = _num_values(values, float)
            if not floats:
                continue
            lookup["value_float__in"] = floats
        elif value_type in ("text", "list"):
            lookup["value_text__in"] = [str(v) for v in values]
        else:
            # file — не фильтруем.
            continue

        exists = Exists(value_model.objects.filter(**lookup))
        gate = ~Q(**{f"{type_field}_id": getattr(field, f"{type_field}_id")})
        conds.append(exists | gate)
    return conds


def eav_field_value_suggestions(field, value_model, *, search="", limit=20):
    """B27. Подсказки существующих значений реквизита (для автоподсказки текст/
    число-фильтров): различные непустые значения поля из value_model, отфильтро-
    ванные подстрокой ``search`` (без учёта регистра), отсортированные, ≤ limit.
    Список/булев сюда не идут — у них фиксированный набор вариантов на фронте."""
    col = {"text": "value_text", "int": "value_int", "float": "value_float"}.get(field.value_type)
    if not col:
        return []
    qs = value_model.objects.filter(field_id=field.pk).exclude(**{f"{col}__isnull": True})
    if field.value_type == "text":
        qs = qs.exclude(value_text="")
    raw = qs.values_list(col, flat=True).distinct()
    term = (search or "").strip().lower()
    out = []
    seen = set()
    for v in raw:
        s = str(v)
        if term and term not in s.lower():
            continue
        if s in seen:
            continue
        seen.add(s)
        out.append(s)
    out.sort(key=lambda s: (len(s), s.lower()))
    return out[:limit]


def csv_ids(param):
    """Разобрать query-параметр «id через запятую» в список непустых строк.
    Пустая строка/None → пустой список (фильтр не применяется)."""
    return [v for v in (param or "").split(",") if v]
