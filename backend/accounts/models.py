from django.contrib.auth.base_user import AbstractBaseUser
from django.contrib.auth.models import PermissionsMixin
from django.db import models
from django.utils import timezone

from .managers import UserManager


class User(AbstractBaseUser, PermissionsMixin):
    """Учётная запись для входа. Email — логин, роль — фиксированный enum
    (уровни доступа не редактируются через интерфейс)."""

    class Role(models.TextChoices):
        ADMIN = "admin", "Администратор"
        ACCOUNTANT = "accountant", "Ответственный за учёт"
        MAINTENANCE = "maintenance", "Ответственный за ТО"
        EMPLOYEE = "employee", "Сотрудник"

    email = models.EmailField("Email", unique=True)
    role = models.CharField("Уровень доступа", max_length=20, choices=Role.choices, default=Role.EMPLOYEE)
    # Применимо только при role=EMPLOYEE — проверка вне модели (Фаза 3/4).
    is_observer = models.BooleanField("Наблюдатель", default=False)
    # B13+/B23: применимо только при role=ACCOUNTANT — «Ответственный за ТО»
    # (проведение ТО). До B23 флаг совмещал проведение и управление регламентами;
    # с B23 управление регламентами вынесено в can_manage_regulations, а этот флаг
    # отвечает только за проведение ТО (с учётом области типов, см. ниже).
    can_maintain = models.BooleanField("Ответственный за ТО", default=False)
    # B23: применимо только при role=ACCOUNTANT — «Может управлять регламентами ТО»
    # (создавать/править/отменять типовые и индивидуальные регламенты, назначать
    # дату первого ТО). Без флага блок «Регламенты» и настройка регламентов в типах
    # недоступны. Не зависит от can_maintain (независимые чекбоксы).
    can_manage_regulations = models.BooleanField("Может управлять регламентами ТО", default=False)
    # B23: область типов оборудования для проведения ТО. Применимо к роли
    # MAINTENANCE и к ACCOUNTANT с can_maintain. True — все типы с включённым ТО;
    # False — только выбранные в maintenance_types. По умолчанию «все» (обратная
    # совместимость).
    maintenance_all_types = models.BooleanField("ТО по всем типам оборудования", default=True)
    # B23: выбранные типы оборудования, для которых разрешено проведение ТО, когда
    # maintenance_all_types=False. M2M на equipment.EquipmentType по строковой
    # ссылке (без импорта — избегаем цикла accounts<->equipment).
    maintenance_types = models.ManyToManyField(
        "equipment.EquipmentType", verbose_name="Типы оборудования для ТО",
        blank=True, related_name="maintainer_users",
    )
    is_active = models.BooleanField("Активен", default=True)
    is_email_confirmed = models.BooleanField("Email подтверждён", default=False)
    employee = models.OneToOneField(
        "employees.Employee", verbose_name="Сотрудник",
        on_delete=models.SET_NULL, null=True, blank=True, related_name="user",
    )
    # Доступ к Django admin — Фаза 2 держит его временно включённым для
    # ручной проверки моделей; отдельного UI-переключателя роль не даёт.
    is_staff = models.BooleanField(default=False)
    date_joined = models.DateTimeField(auto_now_add=True)

    # Защита от подбора пароля: счётчик подряд неудачных попыток
    # (капча — с 3-й, блокировка на 5 минут — с 5-й), сбрасывается при
    # успешном входе.
    failed_login_attempts = models.PositiveSmallIntegerField(default=0)
    locked_until = models.DateTimeField(null=True, blank=True)

    # Таймеры повторной отправки писем — состояние на
    # сервере, а не только на фронте, чтобы нельзя было спамить отправку.
    # password_reset_sent_at не влияет на нейтральный ответ — throttle
    # молча пропускает повторную отправку, наружу всегда один и тот же текст.
    email_confirmation_sent_at = models.DateTimeField(null=True, blank=True)
    invite_sent_at = models.DateTimeField(null=True, blank=True)
    password_reset_sent_at = models.DateTimeField(null=True, blank=True)

    # Дата последнего изменения пароля (блок «Пароль» в Профиле) —
    # проставляется в set_password() ниже, единой точкой для всех сценариев
    # (регистрация, приглашение, сброс, смена из Профиля, Setup Wizard).
    password_changed_at = models.DateTimeField(null=True, blank=True)

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    class Meta:
        verbose_name = "Пользователь"
        verbose_name_plural = "Пользователи"

    def __str__(self):
        return self.email

    def set_password(self, raw_password):
        super().set_password(raw_password)
        self.password_changed_at = timezone.now()

    def save(self, *args, **kwargs):
        # is_staff (доступ к Django admin) синхронизирован с ролью — нет
        # отдельного поля/переключателя, которым можно рассинхронизировать.
        if self.role == self.Role.ADMIN:
            self.is_staff = True
        elif not self.is_superuser:
            self.is_staff = False
        super().save(*args, **kwargs)
