"""Детерминированный сид для E2E-набора (B41).

Создаёт первого администратора и минимальный набор учёток по ролям, чтобы
Playwright-набор проходил на ЧИСТОЙ БД в CI без прохождения Setup Wizard.

Почему напрямую, а не через Setup Wizard: на чистой установке первого админа
штатно создаёт только мастер настройки (см. company/views. _guard). Для
воспроизводимого CI надёжнее создать администратора управляющей командой —
меньше шагов, нет зависимости от почты/капчи мастера. Бизнес-объекты команда
намеренно НЕ создаёт: спеки заводят свои изолированные данные (свой Вид
оборудования, свой склад и т.п.) с уникальными префиксами.

Идемпотентна: повторный запуск не плодит дубликаты и обновляет пароли.
Пароль по умолчанию — E2E_SEED_PASSWORD (или «changeme»). Только для тестовых
окружений; на прод не запускать.
"""
import os

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction

User = get_user_model()

PASSWORD = os.environ.get("E2E_SEED_PASSWORD", "changeme")

# email → (role, is_observer, is_superuser)
ACCOUNTS = [
    ("admin@example.com", User.Role.ADMIN, False, True),
    ("accountant@example.com", User.Role.ACCOUNTANT, False, False),
    ("view@example.com", User.Role.EMPLOYEE, True, False),   # Наблюдатель
    ("emp@example.com", User.Role.EMPLOYEE, False, False),   # Обычный сотрудник
]


class Command(BaseCommand):
    help = "Создать детерминированные учётки для E2E-набора (B41). Только для тестовых окружений."

    @transaction.atomic
    def handle(self, *args, **options):
        for email, role, is_observer, is_superuser in ACCOUNTS:
            user, created = User.objects.get_or_create(
                email=email,
                defaults={
                    "role": role,
                    "is_observer": is_observer,
                    "is_superuser": is_superuser,
                    "is_active": True,
                    "is_email_confirmed": True,
                },
            )
            # Обновляем ключевые поля и пароль (идемпотентность).
            user.role = role
            user.is_observer = is_observer
            user.is_superuser = is_superuser
            user.is_active = True
            user.is_email_confirmed = True
            user.set_password(PASSWORD)
            user.save()
            self.stdout.write(f"{'создан' if created else 'обновлён'}: {email} ({role})")

        self.stdout.write(self.style.SUCCESS("Сид E2E готов."))
