"""Построчная история бизнес-объектов на основе django-simple-history.

Две категории строк (для фильтра на карточке):
  • «movement» (движения) — создание объекта, привязка/открепление к сотруднику,
    списание/утилизация;
  • «change» (изменения) — правки реквизитов и атрибутов.

Каждая строка: {date, author, kind, category, label, old, new, secret, comment,
lines}. kind: 'created' | 'changed' | 'movement'. Для 'created' заполнены lines
(список {label, value} — какие поля были заполнены при создании) и comment
(необязательный комментарий из history_change_reason).

field_specs: dict имя_поля -> {
    "label": str,
    "format": callable(value)->str,          # значения FK приходят как id
    "in_created": bool (по умолчанию True),  # показывать ли в записи «создан»
}.
"""

from datetime import timedelta

# Реквизиты, появившиеся в это окно от момента создания объекта, считаем
# заполненными «при создании» и уносим их в запись «Объект создан».
CREATION_WINDOW = timedelta(seconds=10)

# Значения, которые не показываем в перечне полей записи «Объект создан».
_EMPTY_CREATED_VALUES = {None, "", "—", "Нет"}


def _fmt_text(value):
    return "—" if value in (None, "") else str(value)


def _raw_field(record, field):
    """Сырое значение поля историчной записи: для FK берём *_id, чтобы
    форматтеры (написанные под diff_against) получали id, а не инстанс."""
    if hasattr(record, field + "_id"):
        return getattr(record, field + "_id")
    return getattr(record, field, None)


def _created_lines(record, field_specs):
    """Строки «поле: значение» для записи создания — только заполненные поля."""
    lines = []
    for field, spec in field_specs.items():
        if spec.get("in_created") is False:
            continue
        fmt = spec.get("format", _fmt_text)
        val = fmt(_raw_field(record, field))
        if val in _EMPTY_CREATED_VALUES:
            continue
        lines.append({"label": spec["label"], "value": val, "secret": bool(spec.get("secret"))})
    return lines


def build_history_rows(instance, field_specs, *, movement_fields=(), movement_events=(), created_extra_lines=None, m2m_specs=None):
    """Строки истории базового объекта (новые сверху).

    movement_fields — поля, чьи изменения считаются движением (напр. employee).
    movement_events — события-движения, показываемые одной строкой вместо набора
      пофайловых изменений: список dict {
        "trigger": имя_поля, "to": ожидаемое новое булево (True),
        "consume": [поля, которые не показывать отдельно],
        "label": str | callable(record)->str,
      }.
    created_extra_lines — доп. строки полей (напр. реквизиты Типа) для записи
      «Объект создан».
    m2m_specs — dict имя_m2m_менеджера_историчной_записи -> {
        "id_attr": имя поля id в through-историчной записи (напр. "building_id"),
        "label": str,
        "format": callable(list_ids)->str,     # человекочитаемое перечисление
      }. Изменения M2M-набора между соседними версиями показываются строкой
      «изменено». Переходы внутри «окна создания» (M2M проставляется сразу после
      создания объекта) не показываем — они уже в записи «Объект создан».
    """
    movement_fields = set(movement_fields)
    m2m_specs = m2m_specs or {}
    history = list(instance.history.all())  # новые сверху
    # Конец «окна создания» — чтобы не дублировать M2M, проставленный при создании.
    creation = next((r for r in history if r.history_type == "+"), None)
    creation_window_end = (creation.history_date + CREATION_WINDOW) if creation else None
    rows = []
    for i, record in enumerate(history):
        author = record.history_user.email if record.history_user_id else None
        date = record.history_date
        reason = (getattr(record, "history_change_reason", None) or "").strip()

        if record.history_type == "+":
            lines = _created_lines(record, field_specs)
            if created_extra_lines:
                lines = lines + [
                    ln for ln in created_extra_lines if ln["value"] not in _EMPTY_CREATED_VALUES
                ]
            rows.append({
                "date": date, "author": author, "kind": "created", "category": "movement",
                "label": "Объект создан", "old": None, "new": None, "secret": False,
                "comment": reason or None, "lines": lines,
            })
            continue

        older = history[i + 1] if i + 1 < len(history) else None
        if older is None:
            continue

        changes = {c.field: c for c in record.diff_against(older).changes}

        # События-движения (утилизация/списание) — одной строкой.
        consumed = set()
        for ev in movement_events:
            ch = changes.get(ev["trigger"])
            if ch is None:
                continue
            if bool(ch.new) == ev.get("to", True) and bool(ch.old) != bool(ch.new):
                label = ev["label"](record) if callable(ev["label"]) else ev["label"]
                rows.append({
                    "date": date, "author": author, "kind": "movement", "category": "movement",
                    "label": label, "old": None, "new": None, "secret": False,
                    "comment": reason or None,
                })
                consumed |= set(ev.get("consume", [ev["trigger"]]))

        for field, change in changes.items():
            if field in consumed:
                continue
            spec = field_specs.get(field)
            if not spec:
                continue
            fmt = spec.get("format", _fmt_text)
            category = "movement" if field in movement_fields else "change"
            rows.append({
                "date": date, "author": author, "kind": "changed", "category": category,
                "label": spec["label"], "old": fmt(change.old), "new": fmt(change.new),
                "secret": False,
                "comment": reason if (category == "movement" and reason) else None,
            })

        # Изменения M2M-наборов (здания/помещения/места пропуска). Пропускаем
        # переходы внутри «окна создания» — они уже отражены в «Объект создан».
        if m2m_specs and (creation_window_end is None or record.history_date > creation_window_end):
            for attr, spec in m2m_specs.items():
                new_ids = sorted(getattr(x, spec["id_attr"]) for x in getattr(record, attr).all())
                old_ids = sorted(getattr(x, spec["id_attr"]) for x in getattr(older, attr).all())
                if new_ids == old_ids:
                    continue
                rows.append({
                    "date": date, "author": author, "kind": "changed", "category": "change",
                    "label": spec["label"],
                    "old": spec["format"](old_ids) or "—", "new": spec["format"](new_ids) or "—",
                    "secret": False, "comment": None,
                })
    return rows


def build_related_history_rows(
    records, label_fn, value_fn, secret_fn=None, id_attr="id", *, created_at=None
):
    """История связанных «значений» (реквизиты Типа, доп.поля). Возвращает кортеж
    (rows, created_lines): rows — строки-изменения (category='change'),
    created_lines — значения, заполненные в момент создания объекта (уносятся в
    запись «Объект создан», если передан created_at).
    label_fn(record)->str, value_fn(record)->значение, secret_fn(record)->bool.
    """
    from collections import defaultdict

    groups = defaultdict(list)
    for r in records:
        groups[getattr(r, id_attr)].append(r)

    rows = []
    created_lines = []
    window = CREATION_WINDOW.total_seconds()
    for recs in groups.values():
        recs.sort(key=lambda r: r.history_date)  # старые -> новые
        prev = "—"
        first = True
        for r in recs:
            author = r.history_user.email if r.history_user_id else None
            secret = bool(secret_fn(r)) if secret_fn else False
            cur = "—" if r.history_type == "-" else _fmt_text(value_fn(r))
            if cur == prev:
                first = False
                continue
            is_creation_value = (
                first and prev == "—" and cur != "—" and created_at is not None
                and abs((r.history_date - created_at).total_seconds()) <= window
            )
            if is_creation_value:
                created_lines.append({"label": label_fn(r), "value": cur, "secret": secret})
            elif not (prev == "—" and cur == "—"):
                rows.append({
                    "date": r.history_date, "author": author, "kind": "changed",
                    "category": "change",
                    "label": label_fn(r), "old": prev, "new": cur, "secret": secret,
                    "comment": None,
                })
            prev = cur
            first = False
    return rows, created_lines
