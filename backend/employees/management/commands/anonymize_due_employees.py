"""Тик cron — то же расписание, что и авто-бэкапы/ТО-напоминания, без
Celery/очередей. Идемпотентно: обезличивает уволенных, у кого истёк срок
Company.anonymize_after_months (см. employees/services.py)."""
from django.core.management.base import BaseCommand

from employees.services import anonymize_due_employees


class Command(BaseCommand):
    help = "Обезличивает ПДн уволенных сотрудников, у которых истёк срок хранения (B51-R1)."

    def handle(self, *args, **options):
        count = anonymize_due_employees()
        if count:
            self.stdout.write(self.style.SUCCESS(f"Обезличено записей: {count}"))
        else:
            self.stdout.write("Обезличивание не требуется.")
