"""Защитные data-миграции (стандарт B69).

Деструктивная data-миграция (удаление/перезапись пользовательских строк — сама
по себе или ради последующего ``AddConstraint``/сужения типа) **не должна молча
терять данные**. Механизм из двух слоёв:

1. **Пометка миграции** — класс ``Migration`` выставляет ``ele_destructive = True``
   (и, желательно, ``ele_destructive_note`` — что именно удаляется). Пре-migrate
   команда :mod:`core.management.commands.check_destructive_migrations`
   (вызывается из ``entrypoint.sh`` перед ``migrate``) при накате такой миграции
   **останавливает обновление** и требует явного подтверждения оператора
   (переменная окружения ``ELE_CONFIRM_DESTRUCTIVE=1`` после резервной копии).
   На чистой установке (нет ни одной применённой миграции) гейт не срабатывает —
   терять нечего.

2. **Внутри ``RunPython``** — вместо «тихого» ``.delete()`` использовать один из
   хелперов ниже:
   * :func:`abort_if` / :func:`abort_if_duplicates` — обнаружить опасное состояние
     и остановиться понятным сообщением (что нашли и как разрешить). Исключение
     откатывает транзакцию миграции и валит ``migrate`` — данные целы.
   * :func:`archive_rows` — сохранить строки в файл-архив перед удалением.

Уже применённые деструктивные миграции (``employees/0006`` ``_dedupe``,
``equipment/0010`` purge) НЕ переписываем — стандарт распространяется на будущие.
См. заметку памяти ``project_defensive_migrations`` и раздел «Обновление с ранних
версий» в ``CHANGELOG.md``.
"""

from __future__ import annotations

import json
import logging
import os
import tempfile
from datetime import datetime, timezone

from django.conf import settings
from django.db.models import Count

logger = logging.getLogger(__name__)

CONFIRM_ENV = "ELE_CONFIRM_DESTRUCTIVE"
_TRUTHY = {"1", "true", "yes", "on"}


class DestructiveMigrationAbort(RuntimeError):
    """Останавливает ``migrate``, не оставляя частичного изменения данных."""


# --- Пометка и подтверждение (используются пре-migrate гейтом) ---------------


def is_destructive(migration) -> bool:
    """Помечен ли класс миграции как деструктивный автором."""
    return bool(getattr(migration, "ele_destructive", False))


def destructive_note(migration) -> str:
    note = getattr(migration, "ele_destructive_note", "")
    return str(note).strip()


def find_destructive(plan) -> list:
    """Из плана ``migrate`` (список ``(migration, backwards)``) — прямые
    деструктивные миграции."""
    return [m for m, backwards in plan if not backwards and is_destructive(m)]


def confirmation_given(environ=None) -> bool:
    """Подтвердил ли оператор накат деструктивных миграций через окружение."""
    env = os.environ if environ is None else environ
    return str(env.get(CONFIRM_ENV, "")).strip().lower() in _TRUTHY


# --- Хелперы для тела RunPython ----------------------------------------------


def abort_if(condition, message: str) -> None:
    """Остановить миграцию с понятным сообщением, если условие истинно."""
    if condition:
        raise DestructiveMigrationAbort(message)


def abort_if_duplicates(Model, field, *, skip_empty=False, resolve_hint=""):
    """Остановить миграцию, если по ``field`` есть дубли (иначе навешивание
    уникальности молча удалило бы строки). ``Model`` — из ``apps.get_model``.

    Ничего не удаляет: сообщает, какие значения задвоены, и как разрешить.
    """
    qs = Model.objects.values(field).annotate(_n=Count("pk")).filter(_n__gt=1)
    if skip_empty:
        qs = qs.exclude(**{field: ""})
    dupes = list(qs.order_by()[:50])
    if not dupes:
        return
    sample = ", ".join(str(d[field]) for d in dupes[:10])
    label = f"{Model._meta.label}.{field}"
    hint = resolve_hint or "Разрешите дубли вручную и повторите обновление."
    raise DestructiveMigrationAbort(
        f"Обнаружены дубликаты {label} ({len(dupes)}+ значений: {sample} …). "
        f"Уникальность не навешена, чтобы не удалить строки автоматически. {hint}"
    )


def _archive_dir() -> str:
    candidates = [
        os.environ.get("ELE_MIGRATION_ARCHIVE_DIR"),
        str(getattr(settings, "MEDIA_ROOT", "") or "") or None,
        tempfile.gettempdir(),
    ]
    for base in candidates:
        if not base:
            continue
        target = os.path.join(base, "migration_archives")
        try:
            os.makedirs(target, exist_ok=True)
            return target
        except OSError:
            continue
    return tempfile.gettempdir()


def archive_rows(queryset, *, label: str):
    """Сохранить строки ``queryset`` в JSON-файл перед удалением и вернуть путь
    (``None``, если строк нет). Путь пишется в лог. Вызывать ДО ``.delete()``.
    """
    rows = list(queryset.values())
    if not rows:
        return None
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    safe = "".join(c if c.isalnum() or c in "-_." else "_" for c in label)
    path = os.path.join(_archive_dir(), f"{stamp}_{safe}.json")
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(rows, fh, ensure_ascii=False, default=str, indent=2)
    logger.warning("Архив %d строк перед удалением сохранён: %s", len(rows), path)
    return path
