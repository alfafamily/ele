"""Тик cron — то же расписание, что и миграция хранилища (Фаза 5),
без Celery/очередей. Идемпотентно: не более одной авто-копии
в сутки, см. backup/service.py run_scheduled_backup_if_due()."""
from django.core.management.base import BaseCommand

from backup.service import run_scheduled_backup_if_due


class Command(BaseCommand):
    help = "Создаёт автоматическую резервную копию, если наступило время по расписанию Компании."

    def handle(self, *args, **options):
        record = run_scheduled_backup_if_due()
        if record:
            self.stdout.write(self.style.SUCCESS(f"Создана авто-копия: {record.file.original_filename}"))
        else:
            self.stdout.write("Автокопирование не требуется.")
