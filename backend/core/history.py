"""Построчная «История изменений» бизнес-объектов на основе
django-simple-history: что изменилось, старое → новое значение.

field_specs: dict имя_поля -> {"label": str, "format": callable(value)->str}.
Значения FK-полей приходят из diff_against как id (или None) — форматтер должен
превратить их в человекочитаемое представление.
"""


def _fmt_text(value):
    return "—" if value in (None, "") else str(value)


def build_history_rows(instance, field_specs):
    """Возвращает список строк истории (новые сверху):
    {date, author, kind: 'created'|'changed', label, old, new}."""
    history = list(instance.history.all())  # django-simple-history: новые сверху
    rows = []
    for i, record in enumerate(history):
        author = record.history_user.email if record.history_user_id else None
        date = record.history_date

        if record.history_type == "+":
            rows.append(
                {"date": date, "author": author, "kind": "created", "label": "Объект создан", "old": None, "new": None, "secret": False}
            )
            continue

        older = history[i + 1] if i + 1 < len(history) else None
        if older is None:
            continue

        for change in record.diff_against(older).changes:
            spec = field_specs.get(change.field)
            if not spec:
                continue
            fmt = spec.get("format", _fmt_text)
            rows.append(
                {
                    "date": date,
                    "author": author,
                    "kind": "changed",
                    "label": spec["label"],
                    "old": fmt(change.old),
                    "new": fmt(change.new),
                    "secret": False,
                }
            )
    return rows


def build_related_history_rows(records, label_fn, value_fn, secret_fn=None, id_attr="id"):
    """История связанных «значений» (реквизиты Типа, доп.поля): для каждого
    экземпляра (по id_attr) diff по хронологии значений — что стало.
    label_fn(record)->str, value_fn(record)->значение, secret_fn(record)->bool
    (маскировать ли, напр. «Номер/ключ»)."""
    from collections import defaultdict

    groups = defaultdict(list)
    for r in records:
        groups[getattr(r, id_attr)].append(r)

    rows = []
    for recs in groups.values():
        recs.sort(key=lambda r: r.history_date)  # старые -> новые
        prev = "—"
        for r in recs:
            author = r.history_user.email if r.history_user_id else None
            secret = bool(secret_fn(r)) if secret_fn else False
            cur = "—" if r.history_type == "-" else _fmt_text(value_fn(r))
            if cur == prev:
                continue
            if not (prev == "—" and cur == "—"):
                rows.append(
                    {
                        "date": r.history_date,
                        "author": author,
                        "kind": "changed",
                        "label": label_fn(r),
                        "old": prev,
                        "new": cur,
                        "secret": secret,
                    }
                )
            prev = cur
    return rows
