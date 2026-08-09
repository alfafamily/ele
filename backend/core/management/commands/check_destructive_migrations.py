"""Пре-migrate страховка (B69): останавливает обновление, если в накате есть
миграции, помеченные автором как деструктивные (``ele_destructive = True``), пока
оператор явно не подтвердит их через ``ELE_CONFIRM_DESTRUCTIVE=1``.

Вызывается из ``entrypoint.sh`` ПЕРЕД ``migrate``. На чистой установке (нет ни
одной применённой миграции) не срабатывает — терять нечего. См.
``core.migration_safety`` и заметку памяти ``project_defensive_migrations``.
"""

from django.core.management.base import BaseCommand
from django.db import DEFAULT_DB_ALIAS, OperationalError, connections
from django.db.migrations.executor import MigrationExecutor

from core.migration_safety import (
    CONFIRM_ENV,
    confirmation_given,
    destructive_note,
    find_destructive,
)


class Command(BaseCommand):
    help = (
        "Останавливает обновление, если среди неприменённых миграций есть "
        "помеченные деструктивными, до подтверждения оператора."
    )

    def handle(self, *args, **options):
        connection = connections[DEFAULT_DB_ALIAS]
        try:
            executor = MigrationExecutor(connection)
        except OperationalError:
            # БД недоступна — пусть штатный `migrate` выдаст свою ошибку.
            return

        # Чистая установка: ни одной применённой миграции — данных нет.
        if not executor.loader.applied_migrations:
            return

        targets = executor.loader.graph.leaf_nodes()
        plan = executor.migration_plan(targets)
        destructive = find_destructive(plan)
        if not destructive:
            return

        listing = "\n".join(
            f"  • {m.app_label}.{m.name}"
            + (f" — {destructive_note(m)}" if destructive_note(m) else "")
            for m in destructive
        )

        if confirmation_given():
            self.stdout.write(
                f"{CONFIRM_ENV}=1 — деструктивные миграции подтверждены оператором, "
                f"продолжаю:\n{listing}"
            )
            return

        self.stderr.write(
            "\n"
            "============================================================\n"
            "ОБНОВЛЕНИЕ ОСТАНОВЛЕНО: в накате есть необратимые миграции данных.\n"
            "Они могут безвозвратно удалить или перезаписать строки:\n"
            f"{listing}\n\n"
            "Сначала сделайте резервную копию (Настройки → Резервное копирование),\n"
            "затем подтвердите обновление: добавьте в .env строку\n"
            f"    {CONFIRM_ENV}=1\n"
            "и повторите запуск:\n"
            "    docker compose -f docker-compose.prod.yml up -d\n"
            f"После успешного обновления уберите {CONFIRM_ENV} из .env.\n"
            "============================================================"
        )
        # Ненулевой выход → `set -e` в entrypoint.sh останавливает старт до migrate.
        raise SystemExit(1)
