"""Переносит файлы между хранилищами при смене режима в Настройках → Компания
. Запускается по расписанию через cron-сервис в docker-compose —
без Celery/очередей (масштаб проекта их не требует).

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
        migrated = 0
        failed = 0
        for stored_file in pending:
            if self._migrate_one(stored_file, target, target_backend):
                migrated += 1
            else:
                failed += 1

        # B66: журнал — только результативный прогон и ошибки (пустой тик отсекли
        # выше через `return`, сюда попадаем только когда была партия к переносу).
        from core.background_jobs import record_error, record_run
        from core.models import BackgroundJobRun

        if failed:
            record_error(
                BackgroundJobRun.Job.STORAGE_MIGRATION,
                f"Не удалось перенести файлов: {failed}" + (f"; перенесено: {migrated}" if migrated else ""),
            )
        elif migrated:
            record_run(
                BackgroundJobRun.Job.STORAGE_MIGRATION,
                BackgroundJobRun.Status.OK,
                affected=migrated,
                detail=f"Перенесено файлов: {migrated}",
            )

    def _migrate_one(self, stored_file: StoredFile, target: str, target_backend) -> bool:
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
                # атомарно "бесплатно", без обхода N таблиц.
                stored_file.backend = target
                stored_file.path = new_path
                stored_file.migration_status = StoredFile.MigrationStatus.DONE
                stored_file.migration_error = ""
                stored_file.save(update_fields=["backend", "path", "migration_status", "migration_error"])
            get_backend(old_backend_name).delete(old_path)
            self.stdout.write(f"Перенесён: {stored_file.original_filename or stored_file.path}")
            return True
        except Exception as exc:  # noqa: BLE001 — любая ошибка переноса одного файла не должна прерывать партию
            stored_file.migration_status = StoredFile.MigrationStatus.ERROR
            stored_file.migration_error = str(exc)
            stored_file.save(update_fields=["migration_status", "migration_error"])
            self.stderr.write(f"Ошибка переноса {stored_file.original_filename or stored_file.path}: {exc}")
            return False
