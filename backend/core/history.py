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

# Одна правка M2M-набора через `.set()` (напр. замена здания у пропуска) рождает
# ДВА снимка истории: Django шлёт сигнал m2m_changed раздельно на удаление и
# добавление, а django-simple-history пишет по историчной записи на каждый. Из-за
# промежуточного снимка (набор пуст) diff давал бы две строки («— → новое» и
# «старое → —») вместо одной. Снимки одной операции отстоят на миллисекунды;
# настоящие пользовательские правки набора — на секунды и больше. Соседние версии
# ближе этого окна считаем одной операцией и берём только её итоговое состояние.
M2M_MERGE_WINDOW = timedelta(seconds=1)

# Значения, которые не показываем в перечне полей записи «Объект создан».
_EMPTY_CREATED_VALUES = {None, "", "—", "Нет"}

# B32. Служебная причина для записи истории, которую откат объекта пишет при
# отказе сотрудника: сама запись в истории не показывается (факт отказа виден в
# строке статуса записи закрепления), но остаётся в БД, чтобы не рвать цепочку
# diff simple-history для последующих закреплений того же объекта.
REJECT_ROLLBACK_REASON = "__b32_reject_rollback__"


def _fmt_text(value):
    return "—" if value in (None, "") else str(value)


def _raw_field(record, field):
    """Сырое значение поля историчной записи: для FK берём *_id, чтобы
    форматтеры (написанные под diff_against) получали id, а не инстанс."""
    if hasattr(record, field + "_id"):
        return getattr(record, field + "_id")
    return getattr(record, field, None)


def _holder(record, fields):
    """Текущий «держатель» из группы взаимоисключающих полей размещения
    (сотрудник/место/склад/оборудование): первое непустое поле. Возвращает
    (имя_поля, значение) или (None, None), если объект нигде не размещён."""
    for f in fields:
        val = _raw_field(record, f)
        if val:
            return f, val
    return None, None


def _placement_row(placement_group, field_specs, *, date, author, old_field, old_val,
                   new_field, new_val, reason, acceptance_for):
    """Одна запись-движение «было → стало» для смены держателя (сотрудник↔место).
    Заголовок (title) зависит от нового держателя; при закреплении за сотрудником
    подшивается статус акцепта."""
    old_disp = field_specs[old_field]["format"](old_val) if old_field and old_field in field_specs else "—"
    new_disp = field_specs[new_field]["format"](new_val) if new_field and new_field in field_specs else "—"
    title = placement_group["titles"].get(new_field) or placement_group.get("empty_title", "Открепление")
    row = {
        "date": date, "author": author, "kind": "changed", "category": "movement",
        "title": title, "label": title, "old": old_disp, "new": new_disp,
        "secret": False, "comment": reason or None,
    }
    if acceptance_for is not None and new_field == "employee" and new_val:
        texts = acceptance_for("employee", new_val, date)
        if texts:
            row["acceptance"] = texts
    return row


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


def _emit_created(record, field_specs, movement_fields, created_extra_lines,
                  placement_group, acceptance_for, *, date, author, reason):
    """Строки для историчной записи создания объекта (`history_type == "+"`).

    «Объект создан» — гибридная запись: это и ИЗМЕНЕНИЕ (перечень реквизитов, с
    которыми создан объект), и ДВИЖЕНИЕ (поступление — комментарий «откуда
    поступил»). На фронте показывается в обоих фильтрах (спец-случай
    kind='created'); размещение при создании выносим отдельными записями-
    движениями со статусом акцепта (B32).

    Порядок эмиссии: сначала движения, потом «Объект создан» — у них одинаковый
    timestamp, и стабильная сортировка (новые сверху) оставит «Объект создан» В
    САМОМ НИЗУ (сначала объект создали, потом закрепили).
    """
    lines = _created_lines(record, field_specs)
    if created_extra_lines:
        lines = lines + [
            ln for ln in created_extra_lines if ln["value"] not in _EMPTY_CREATED_VALUES
        ]
    rows = []
    if placement_group:
        nf, nv = _holder(record, placement_group["fields"])
        if nf:
            rows.append(_placement_row(
                placement_group, field_specs, date=date, author=author,
                old_field=None, old_val=None, new_field=nf, new_val=nv,
                reason=None, acceptance_for=acceptance_for,
            ))
    else:
        for field in movement_fields:
            raw = _raw_field(record, field)
            if not raw:
                continue
            spec = field_specs.get(field)
            if not spec:
                continue
            fmt = spec.get("format", _fmt_text)
            mv = {
                "date": date, "author": author, "kind": "changed", "category": "movement",
                "label": spec["label"], "old": fmt(None), "new": fmt(raw),
                "secret": False, "comment": None,
            }
            if acceptance_for is not None and field == "employee":
                texts = acceptance_for("employee", raw, date)
                if texts:
                    mv["acceptance"] = texts
            rows.append(mv)
    rows.append({
        "date": date, "author": author, "kind": "created", "category": "movement",
        "label": "Объект создан", "old": None, "new": None, "secret": False,
        "comment": reason or None, "lines": lines,
    })
    return rows


def _emit_movement_events(record, changes, movement_events, consumed, *, date, author, reason):
    """События-движения (утилизация/списание) — одной строкой вместо набора
    пофайловых изменений. Поля события помечаются в `consumed` (мутируется на
    месте), чтобы дальнейшие хендлеры их не дублировали."""
    rows = []
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
    return rows


def _emit_placement(record, older, changes, consumed, placement_group, field_specs,
                    acceptance_for, *, date, author, reason):
    """B32: смена держателя в группе взаимоисключающих полей размещения
    (сотрудник↔место/склад/оборудование) — ОДНОЙ записью «было → стало» вместо
    двух («открепили сотрудника» + «разместили на место»). Не трогаем, если поля
    группы уже поглощены событием (списание/утилизация). Поля группы помечаются
    в `consumed` (мутируется на месте)."""
    if not placement_group:
        return []
    gfields = placement_group["fields"]
    if not (any(f in changes for f in gfields) and not (set(gfields) & consumed)):
        return []
    rows = []
    of, ov = _holder(older, gfields)
    nf, nv = _holder(record, gfields)
    if (of, ov) != (nf, nv):
        rows.append(_placement_row(
            placement_group, field_specs, date=date, author=author,
            old_field=of, old_val=ov, new_field=nf, new_val=nv,
            reason=reason, acceptance_for=acceptance_for,
        ))
    consumed |= set(gfields)
    return rows


def _emit_field_changes(changes, consumed, field_specs, movement_fields,
                        acceptance_for, *, date, author, reason):
    """Пофайловые изменения реквизитов/атрибутов, кроме уже поглощённых полей
    (`consumed`). Движение — если поле в `movement_fields`, иначе изменение."""
    rows = []
    for field, change in changes.items():
        if field in consumed:
            continue
        spec = field_specs.get(field)
        if not spec:
            continue
        fmt = spec.get("format", _fmt_text)
        category = "movement" if field in movement_fields else "change"
        row = {
            "date": date, "author": author, "kind": "changed", "category": category,
            "label": spec["label"], "old": fmt(change.old), "new": fmt(change.new),
            "secret": False,
            "comment": reason if (category == "movement" and reason) else None,
        }
        # B32: подшить статус акцепта к движению закрепления за сотрудником.
        if acceptance_for is not None and category == "movement" and change.new:
            texts = acceptance_for(field, change.new, date)
            if texts:
                row["acceptance"] = texts
        rows.append(row)
    return rows


def _emit_m2m(history, m2m_specs, creation_window_end, *, merge_window=M2M_MERGE_WINDOW):
    """Изменения M2M-наборов (здания/помещения/места пропуска) — по ОДНОЙ строке
    на нетто-изменение набора. `history` — записи новее-сверху.

    В отличие от пофайловых полей, M2M нельзя разбирать пороздово: одна операция
    `.set()` создаёт несколько историчных снимков с промежуточными состояниями
    (см. M2M_MERGE_WINDOW). Поэтому идём по всей хронологии набора, схлопываем
    цепочки близких по времени версий до их итогового состояния и эмитим строку
    только там, где итоговый набор реально изменился. Переходы внутри «окна
    создания» пропускаем — набор при создании уже отражён в «Объект создан»."""
    if not m2m_specs:
        return []
    ordered = list(reversed(history))  # старые -> новые
    if not ordered:
        return []
    rows = []
    for attr, spec in m2m_specs.items():
        id_attr = spec["id_attr"]
        # B38: снимок набора для каждой версии одним запросом, а не
        # getattr(rec, attr).all() per-record. Историчный through-объект (напр.
        # HistoricalAccessPass_buildings) держит FK `history` на историчную запись
        # — группируем его id по history_id. Раньше это давало SELECT на каждую
        # версию × каждый набор (69 запросов на истории пропуска с 23 версиями).
        through = getattr(ordered[0], attr).model
        by_hist = {}
        for hid, oid in through.objects.filter(
            history_id__in=[rec.history_id for rec in ordered]
        ).values_list("history_id", id_attr):
            by_hist.setdefault(hid, []).append(oid)
        # Состояние набора id по каждой версии в хронологическом порядке.
        timeline = [
            (rec, tuple(sorted(by_hist.get(rec.history_id, []))))
            for rec in ordered
        ]
        # Схлопнуть версии одной операции: подряд идущие ближе окна — в итоговую.
        collapsed = []
        for rec, ids in timeline:
            if collapsed and rec.history_date - collapsed[-1][0].history_date < merge_window:
                collapsed[-1] = (rec, ids)
            else:
                collapsed.append((rec, ids))
        # Нетто-переходы между схлопнутыми состояниями.
        prev_ids = collapsed[0][1] if collapsed else ()
        for rec, ids in collapsed[1:]:
            if ids != prev_ids and (creation_window_end is None or rec.history_date > creation_window_end):
                author = rec.history_user.email if rec.history_user_id else None
                rows.append({
                    "date": rec.history_date, "author": author, "kind": "changed",
                    "category": "change", "label": spec["label"],
                    "old": spec["format"](list(prev_ids)) or "—",
                    "new": spec["format"](list(ids)) or "—",
                    "secret": False, "comment": None,
                })
            prev_ids = ids
    return rows


def build_history_rows(instance, field_specs, *, movement_fields=(), movement_events=(), created_extra_lines=None, m2m_specs=None, acceptance_for=None, placement_group=None):
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

    Главный цикл — диспетчер: для записи создания эмитит `_emit_created`, для
    остальных версий строит diff против предыдущей записи и по очереди прогоняет
    хендлеры _emit_movement_events → _emit_placement → _emit_field_changes.
    Первые два помечают «поглощённые» поля в общем множестве `consumed`, чтобы
    следующие их не дублировали (порядок вызовов важен). M2M-наборы разбираются
    отдельным проходом `_emit_m2m` по всей хронологии (см. его док-строку).
    """
    movement_fields = set(movement_fields)
    m2m_specs = m2m_specs or {}
    # B38: history_user читается на каждой записи (author) — select_related,
    # иначе SELECT на пользователя per-record.
    history = list(instance.history.select_related("history_user"))  # новые сверху
    # Конец «окна создания» — чтобы не дублировать M2M, проставленный при создании.
    creation = next((r for r in history if r.history_type == "+"), None)
    creation_window_end = (creation.history_date + CREATION_WINDOW) if creation else None
    rows = []
    for i, record in enumerate(history):
        author = record.history_user.email if record.history_user_id else None
        date = record.history_date
        reason = (getattr(record, "history_change_reason", None) or "").strip()

        # B32: служебный откат при отказе — в истории не показываем (но запись
        # остаётся в БД и участвует в diff-цепочке для следующих записей).
        if reason == REJECT_ROLLBACK_REASON:
            continue

        if record.history_type == "+":
            rows += _emit_created(
                record, field_specs, movement_fields, created_extra_lines,
                placement_group, acceptance_for, date=date, author=author, reason=reason,
            )
            continue

        older = history[i + 1] if i + 1 < len(history) else None
        if older is None:
            continue

        # B38: M2M-наборы разбираем отдельным проходом (_emit_m2m) — исключаем их
        # из diff_against, иначе он на каждой паре версий тянет снимок каждого
        # набора (N+1 по historical through-таблицам).
        changes = {
            c.field: c
            for c in record.diff_against(older, excluded_fields=set(m2m_specs)).changes
        }
        consumed = set()
        rows += _emit_movement_events(
            record, changes, movement_events, consumed,
            date=date, author=author, reason=reason,
        )
        rows += _emit_placement(
            record, older, changes, consumed, placement_group, field_specs,
            acceptance_for, date=date, author=author, reason=reason,
        )
        rows += _emit_field_changes(
            changes, consumed, field_specs, movement_fields,
            acceptance_for, date=date, author=author, reason=reason,
        )
    # M2M-наборы разбираем не пороздово, а по всей хронологии сразу: одна
    # операция .set() рождает промежуточные снимки, которые нужно схлопнуть.
    rows += _emit_m2m(history, m2m_specs, creation_window_end)
    return rows


def build_eav_history_rows(
    obj,
    *,
    owner_field,
    type_field_model,
    field_value_model,
    field_file_model=None,
    custom_field_model=None,
    restrict_to_existing_fields=False,
    mark_locked_secret=False,
):
    """История EAV-реквизитов учётного объекта: реквизиты Типа + файлы реквизитов
    «Несколько файлов» + доп.поля. Возвращает ``(related_rows, created_extra)``.

    Логика идентична для ``equipment`` / ``transport`` / ``licenses`` — раньше
    каждое приложение держало у себя ~50 строк копии этого блока (B53 finding#1,
    хвост B74). Различаются лишь модели, имя FK-владельца (``owner_field``:
    ``"equipment"`` / ``"transport"`` / ``"license"``) и два флага для лицензий:

    * ``restrict_to_existing_fields`` — показывать реквизиты только существующих
      Типов (у удалённого Типа поле-реквизит удалено → название и секретность не
      определяются, иначе бывший «Номер/ключ» показался бы открытым текстом);
    * ``mark_locked_secret`` — реквизиты-ключи (``field.is_locked``) маскируются и
      в истории.

    Приложения без файловых реквизитов передают ``field_file_model=None``; без
    доп.полей — ``custom_field_model=None``.
    """
    from storage.models import StoredFile

    owner_filter = {f"{owner_field}_id": obj.id}

    type_fields = {}

    def field_of(rec):
        if rec.field_id not in type_fields:
            type_fields[rec.field_id] = type_field_model.objects.filter(pk=rec.field_id).first()
        return type_fields[rec.field_id]

    def fv_value(rec):
        f = field_of(rec)
        vt = f.value_type if f else "text"
        if vt == "bool":
            return None if rec.value_bool is None else ("Да" if rec.value_bool else "Нет")
        if vt == "int":
            return rec.value_int
        if vt == "float":
            return rec.value_float
        if vt == "file":
            if not rec.value_file_id:
                return None
            return StoredFile.objects.filter(pk=rec.value_file_id).values_list("original_filename", flat=True).first() or "файл"
        return rec.value_text

    related_rows = []
    created_extra = []

    fv_history = field_value_model.history.filter(**owner_filter)
    if restrict_to_existing_fields:
        existing_field_ids = set(type_field_model.objects.values_list("id", flat=True))
        fv_history = fv_history.filter(field_id__in=existing_field_ids)

    secret_fn = None
    if mark_locked_secret:
        def secret_fn(rec):
            f = field_of(rec)
            return bool(f and f.is_locked)

    req_rows, req_created = build_related_history_rows(
        fv_history,
        label_fn=lambda rec: (field_of(rec).name if field_of(rec) else "Реквизит"),
        value_fn=fv_value,
        secret_fn=secret_fn,
        created_at=obj.created_at,
    )
    related_rows += req_rows
    created_extra += req_created

    # Файлы реквизитов «Несколько файлов» — добавление/удаление отдельных файлов
    # (хранятся в *FieldFile, не в value_file).
    if field_file_model is not None:
        fv_field_name = dict(
            field_value_model.objects.filter(**owner_filter).values_list("id", "field__name")
        )
        if fv_field_name:
            def file_value(rec):
                if not rec.stored_file_id:
                    return None
                return (
                    StoredFile.objects.filter(pk=rec.stored_file_id)
                    .values_list("original_filename", flat=True)
                    .first()
                    or "файл"
                )

            file_rows, file_created = build_related_history_rows(
                field_file_model.history.filter(field_value_id__in=list(fv_field_name)),
                label_fn=lambda rec: fv_field_name.get(rec.field_value_id, "Файл реквизита"),
                value_fn=file_value,
                created_at=obj.created_at,
            )
            related_rows += file_rows
            created_extra += file_created

    # Дополнительные поля
    if custom_field_model is not None:
        cf_rows, cf_created = build_related_history_rows(
            custom_field_model.history.filter(**owner_filter),
            label_fn=lambda rec: rec.name,
            value_fn=lambda rec: rec.value,
            created_at=obj.created_at,
        )
        related_rows += cf_rows
        created_extra += cf_created

    return related_rows, created_extra


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
