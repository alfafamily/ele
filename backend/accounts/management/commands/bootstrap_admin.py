from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

User = get_user_model()


class Command(BaseCommand):
    help = (
        "Создаёт первого администратора из ELE_ADMIN_EMAIL/ELE_ADMIN_PASSWORD "
        "(.env), если пользователей ещё нет (ТЗ §4.1, сценарий 1 — CLI/env)."
    )

    def handle(self, *args, **options):
        if User.objects.exists():
            self.stdout.write("Пользователи уже есть — пропускаю.")
            return
        if not settings.ELE_ADMIN_EMAIL or not settings.ELE_ADMIN_PASSWORD:
            self.stdout.write(
                "ELE_ADMIN_EMAIL/ELE_ADMIN_PASSWORD не заданы — пропускаю "
                "(первого администратора можно создать через Setup Wizard в браузере)."
            )
            return
        User.objects.create_superuser(email=settings.ELE_ADMIN_EMAIL, password=settings.ELE_ADMIN_PASSWORD)
        self.stdout.write(self.style.SUCCESS(f"Создан администратор {settings.ELE_ADMIN_EMAIL}"))
