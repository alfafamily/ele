"""Восстановление системы из JSON-резервной копии — ТОЛЬКО
через CLI на сервере, никакого API/UI-эндпоинта не существует и не должно
появиться (жёсткое ограничение спеки).

Использование (на остановленном/maintenance-режим инстансе, БД пустая):
    docker compose exec backend python manage.py restore_backup <файл>

Деструктивно и не идемпотентно при непустой БД — восстанавливает объекты
с их исходными PK, конфликт первичных ключей означает "это не тот сценарий,
для которого команда предназначена" (см. help выше)."""
import json

from django.core import serializers
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from backup.export import RESTORE_ORDER


class Command(BaseCommand):
    help = (
        "Восстанавливает Компанию/Пользователей/Сотрудников/Оборудование/Лицензии/"
        "Типы из JSON-резервной копии на пустую БД. "
        "Пароли восстанавливаются как есть (хэши, не сбрасываются)."
    )

    def add_arguments(self, parser):
        parser.add_argument("file", help="Путь к JSON-файлу резервной копии")

    def handle(self, *args, **options):
        path = options["file"]
        try:
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
        except OSError as exc:
            raise CommandError(f"Не удалось открыть файл: {exc}")
        except json.JSONDecodeError as exc:
            raise CommandError(f"Файл повреждён или не является валидным JSON: {exc}")

        with transaction.atomic():
            for key in RESTORE_ORDER:
                entries = data.get(key, [])
                if key == "stored_files":
                    # "url" — снимок на момент экспорта, не поле модели.
                    for entry in entries:
                        entry["fields"].pop("url", None)
                count = 0
                # deserialize("json", ...) — симметрично _dump() в export.py:
                # значения (в т.ч. time/date) уже в JSON-виде, "python"-формат
                # ожидал бы сырые python-объекты, которых после json.load() нет.
                for deserialized_obj in serializers.deserialize("json", json.dumps(entries)):
                    deserialized_obj.save()
                    count += 1
                self.stdout.write(f"{key}: {count}")

        self.stdout.write(self.style.SUCCESS("Восстановление завершено."))
