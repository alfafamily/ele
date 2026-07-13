from django.core.management.base import BaseCommand

from company.models import Company


class Command(BaseCommand):
    help = (
        "Сбрасывает ограничение доступа по IP (§3.1, §7.2) — на случай, если "
        "администратор заблокировал сам себя. Веб-интерфейс в этой ситуации "
        "недоступен по определению, поэтому сброс — только через CLI на сервере: "
        "docker compose exec backend python manage.py reset_ip_allowlist"
    )

    def handle(self, *args, **options):
        company = Company.load()
        if not company.ip_allowlist:
            self.stdout.write("Ограничение по IP и так не задано — нечего сбрасывать.")
            return
        company.ip_allowlist = []
        company.save(update_fields=["ip_allowlist"])
        self.stdout.write(self.style.SUCCESS("Ограничение доступа по IP снято."))
