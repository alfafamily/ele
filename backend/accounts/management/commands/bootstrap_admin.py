from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction

from employees.models import Employee

User = get_user_model()


class Command(BaseCommand):
    help = (
        "Создаёт первого администратора из ELE_ADMIN_EMAIL/ELE_ADMIN_PASSWORD "
        "(.env), если пользователей ещё нет (сценарий 1 — CLI/env)."
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
        # Администратору заводим связанного Сотрудника, как учётке из Setup
        # Wizard/Яндекс-входа: имени/фамилии в .env нет, поэтому в оба поля
        # берём часть email до «@» — их можно уточнить позже в карточке.
        login_part = settings.ELE_ADMIN_EMAIL.split("@", 1)[0]
        with transaction.atomic():
            employee = Employee.objects.create(first_name=login_part, last_name=login_part)
            User.objects.create_superuser(
                email=settings.ELE_ADMIN_EMAIL, password=settings.ELE_ADMIN_PASSWORD, employee=employee
            )
        self.stdout.write(self.style.SUCCESS(f"Создан администратор {settings.ELE_ADMIN_EMAIL}"))
