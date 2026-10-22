"""Ожидание доступности БД перед миграциями (B79).

При автоподъёме после перезагрузки хоста Docker запускает контейнеры с
restart-политикой независимо друг от друга: ``depends_on`` и
``condition: service_healthy`` из compose действуют ТОЛЬКО для
``docker compose up``. Поэтому backend штатно стартует раньше, чем postgres
начнёт принимать соединения, и без ожидания ``entrypoint.sh`` падал бы на
``migrate``, а контейнер крутился бы в restart-цикле с растущей задержкой
Docker'а — вместо внятного «ждём БД» в логах лежали бы трейсбеки.

Вызывается из ``entrypoint.sh`` ПЕРЕД ``check_destructive_migrations``/``migrate``
и в начале цикла сервиса ``cron``.
"""

import time

from django.core.management.base import BaseCommand, CommandError
from django.db import DEFAULT_DB_ALIAS, OperationalError, connections

DEFAULT_TIMEOUT_SECONDS = 60
RETRY_DELAY_SECONDS = 1.0


class Command(BaseCommand):
    help = (
        "Ждёт, пока БД начнёт принимать соединения (автоподъём стека после "
        "перезагрузки хоста), и выходит с ошибкой по истечении таймаута."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--timeout",
            type=int,
            default=DEFAULT_TIMEOUT_SECONDS,
            help=(
                "Сколько секунд ждать БД, прежде чем выйти с ошибкой "
                f"(по умолчанию {DEFAULT_TIMEOUT_SECONDS})."
            ),
        )

    def handle(self, *args, **options):
        timeout = options["timeout"]
        deadline = time.monotonic() + timeout
        attempt = 0

        while True:
            attempt += 1
            connection = connections[DEFAULT_DB_ALIAS]
            try:
                connection.ensure_connection()
            except OperationalError as exc:
                # Соединение осталось в нерабочем состоянии — закрываем, иначе
                # следующая попытка переиспользует битый объект.
                connection.close()
                if time.monotonic() >= deadline:
                    raise CommandError(
                        f"БД не отвечает {timeout} с (попыток: {attempt}): {exc}"
                    ) from exc
                if attempt == 1:
                    self.stdout.write("БД пока не отвечает — ждём...")
                time.sleep(RETRY_DELAY_SECONDS)
            else:
                if attempt > 1:
                    self.stdout.write(
                        self.style.SUCCESS(f"БД доступна (попыток: {attempt}).")
                    )
                return
