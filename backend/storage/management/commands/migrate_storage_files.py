"""Переносит файлы между хранилищами при смене режима в Настройках → Компания
(ТЗ §8.3). Запускается по расписанию через cron-сервис в docker-compose —
без Celery/очередей (CLAUDE.md, масштаб проекта их не требует).

Ошибочные записи не подхватываются автоматически следующим тиком — только
через явный retry (см. company.views.StorageMigrationRetryView), чтобы
постоянно битый файл не жёг цикл на каждом запуске."""
from django.core.management.base import BaseCommand
from django.db import transaction

from storage.backends import get_backend, target_backend_name
from storage.models import StoredFile

BATCH_SIZE = 20


class Command(BaseCommand):
    help = "Переносит очередную партию файлов на текущее целевое хранилище компании."

    def handle(self, *args, **options):
        target = target_backend_name()
        pending = list(
            StoredFile.objects.exclude(backend=target)
            .exclude(migration_status=StoredFile.MigrationStatus.ERROR)
            .order_by("id")[:BATCH_SIZE]
        )
        if not pending:
            self.stdout.write("Нечего переносить.")
            return

        target_backend = get_backend(target)
        for stored_file in pending:
            self._migrate_one(stored_file, target, target_backend)

    def _migrate_one(self, stored_file: StoredFile, target: str, target_backend) -> None:
        source_backend = get_backend(stored_file.backend)
        stored_file.migration_status = StoredFile.MigrationStatus.IN_PROGRESS
        stored_file.save(update_fields=["migration_status"])

        try:
            with source_backend.open(stored_file.path) as f:
                new_path = target_backend.save(stored_file.path, f)
            if not target_backend.exists(new_path):
                raise OSError("Файл не найден в целевом хранилище после копирования.")

            old_backend_name, old_path = stored_file.backend, stored_file.path
            with transaction.atomic():
                # Одна строка = все ссылающиеся объекты (Company.logo,
                # Employee.avatar, *FieldValue.value_file) обновляются
                # атомарно "бесплатно", без обхода N таблиц (§8.3).
                stored_file.backend = target
                stored_file.path = new_path
                stored_file.migration_status = StoredFile.MigrationStatus.DONE
                stored_file.migration_error = ""
                stored_file.save(update_fields=["backend", "path", "migration_status", "migration_error"])
            get_backend(old_backend_name).delete(old_path)
            self.stdout.write(f"Перенесён: {stored_file.original_filename or stored_file.path}")
        except Exception as exc:  # noqa: BLE001 — любая ошибка переноса одного файла не должна прерывать партию
            stored_file.migration_status = StoredFile.MigrationStatus.ERROR
            stored_file.migration_error = str(exc)
            stored_file.save(update_fields=["migration_status", "migration_error"])
            self.stderr.write(f"Ошибка переноса {stored_file.original_filename or stored_file.path}: {exc}")
