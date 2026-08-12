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
        MAINTENANCE = "maintenance", "Механик по оборудованию"
        AUTOMECHANIC = "automechanic", "Автомеханик"
        EMPLOYEE = "employee", "Сотрудник"

    email = models.EmailField("Email", unique=True)
    role = models.CharField("Уровень доступа", max_length=20, choices=Role.choices, default=Role.EMPLOYEE)
    # Применимо только при role=EMPLOYEE — проверка вне модели (Фаза 3/4).
    is_observer = models.BooleanField("Наблюдатель", default=False)
    # B13+/B23: применимо только при role=ACCOUNTANT — «Ответственный за ТО
    # Оборудования» (проведение ТО оборудования). До B23 флаг совмещал проведение
    # и управление регламентами; с B23 управление регламентами вынесено в
    # can_manage_regulations, а этот флаг отвечает только за проведение ТО (с учётом
    # области типов, см. ниже).
    can_maintain = models.BooleanField("Ответственный за ТО Оборудования", default=False)
    # B23: применимо только при role=ACCOUNTANT — «Может управлять регламентами ТО
    # Оборудования» (создавать/править/отменять типовые и индивидуальные регламенты,
    # назначать дату первого ТО). Без флага блок «Регламенты» и настройка регламентов
    # в типах недоступны. Не зависит от can_maintain (независимые чекбоксы).
    can_manage_regulations = models.BooleanField("Может управлять регламентами ТО Оборудования", default=False)
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
    # B22: применимо при role=ACCOUNTANT — «Ответственный за ТО Транспорта»
    # (проведение ТО транспорта). Зеркало can_maintain для транспорта.
    can_maintain_transport = models.BooleanField("Ответственный за ТО Транспорта", default=False)
    # B22: применимо при role=ACCOUNTANT — «Может управлять регламентами ТО
    # Транспорта». Зеркало can_manage_regulations для транспорта.
    can_manage_transport_regulations = models.BooleanField("Может управлять регламентами ТО Транспорта", default=False)
    # B22: область типов транспорта для проведения ТО. Применимо к роли
    # AUTOMECHANIC и к ACCOUNTANT с can_maintain_transport. True — все типы
    # транспорта; False — только выбранные в maintenance_transport_types.
    maintenance_all_transport_types = models.BooleanField("ТО по всем типам транспорта", default=True)
    # B22: выбранные типы транспорта для проведения ТО, когда
    # maintenance_all_transport_types=False. M2M на transport.TransportType по
    # строковой ссылке (без импорта — избегаем цикла).
    maintenance_transport_types = models.ManyToManyField(
        "transport.TransportType", verbose_name="Типы транспорта для ТО",
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


# ─────────────────────────────────────────────────────────────────────────────
# B44. Уведомления: почта + Web Push.
# ─────────────────────────────────────────────────────────────────────────────

class NotificationKind(models.TextChoices):
    """Виды уведомлений (единый источник ключей для prefs, диспетчера и API).

    Доступность видов по ролям (проверяется в accounts.notifications):
      - ASSIGNMENT_PENDING — все роли (дублирует письмо о закреплении, B32);
      - ASSIGNMENT_REJECTED — admin и accountant (получателем является тот, кто
        выполнял закрепление); приходит при отказе сотрудника от закрепления;
      - MAINTENANCE_DUE / MAINTENANCE_OVERDUE — admin; accountant с
        can_maintain (оборуд.) и/или can_maintain_transport (транспорт);
        maintenance (оборуд.); automechanic (транспорт);
      - MAINTENANCE_PERFORMED — admin и любой accountant.
    Область типов (equipment_*/transport_*) применима только к видам ТО и
    настраивается admin/accountant; для механиков берётся их область ТО.
    """

    ASSIGNMENT_PENDING = "assignment_pending", "Закрепление нового имущества"
    ASSIGNMENT_REJECTED = "assignment_rejected", "Отказ от закрепления имущества"
    MAINTENANCE_DUE = "maintenance_due", "Подходящее ТО"
    MAINTENANCE_OVERDUE = "maintenance_overdue", "Просроченное ТО"
    MAINTENANCE_PERFORMED = "maintenance_performed", "Выполненное ТО"


class NotificationPreference(models.Model):
    """Настройка каналов уведомлений пользователя по одному виду.

    Отсутствие строки трактуется как «всё включено, все типы» — дефолт B44
    (у всех существующих и новых пользователей почта и push включены по всем
    доступным видам и всем типам). Строка создаётся при первом изменении
    настройки через раздел «Уведомления».
    """

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="notification_prefs")
    kind = models.CharField("Вид уведомления", max_length=32, choices=NotificationKind.choices)
    email_enabled = models.BooleanField("Почта", default=True)
    push_enabled = models.BooleanField("Push", default=True)
    # Область типов (только виды ТО, настраивают admin/accountant). Два
    # независимых блока «Все / Только некоторые» — по образцу maintenance_*
    # флагов роли. True — включая типы, созданные в будущем; False — только
    # выбранные в M2M.
    equipment_all_types = models.BooleanField("Все типы оборудования", default=True)
    transport_all_types = models.BooleanField("Все типы транспорта", default=True)
    equipment_types = models.ManyToManyField(
        "equipment.EquipmentType", verbose_name="Типы оборудования", blank=True,
        related_name="notification_prefs",
    )
    transport_types = models.ManyToManyField(
        "transport.TransportType", verbose_name="Типы транспорта", blank=True,
        related_name="notification_prefs",
    )

    class Meta:
        verbose_name = "Настройка уведомлений"
        verbose_name_plural = "Настройки уведомлений"
        constraints = [
            models.UniqueConstraint(fields=["user", "kind"], name="uniq_notif_pref_user_kind"),
        ]

    def __str__(self):
        return f"{self.user_id}:{self.kind}"


class PushSubscription(models.Model):
    """Web Push-подписка одного устройства/браузера пользователя.

    Push включается отдельно на каждом устройстве (браузер/PWA), поэтому у
    пользователя может быть несколько подписок. Настройки же каналов
    (NotificationPreference) — общие, не зависят от устройства.
    """

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="push_subscriptions")
    # endpoint push-сервиса длинный (может превышать 200 символов) — TextField.
    endpoint = models.TextField("Endpoint", unique=True)
    p256dh = models.CharField("Ключ p256dh", max_length=255)
    auth = models.CharField("Ключ auth", max_length=255)
    user_agent = models.CharField("User-Agent", max_length=300, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_used_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Push-подписка"
        verbose_name_plural = "Push-подписки"

    def __str__(self):
        return f"{self.user_id}:{self.endpoint[:40]}"


class MaintenanceReminderState(models.Model):
    """Дедуп напоминаний о ТО (подходит/просрочено) по одному плану.

    Планировщик крутится часто (сервис cron, раз в минуту), поэтому напоминание
    по плану шлётся один раз при входе в статус, а не каждый прогон. Когда план
    выходит из статусов «подходит/просрочено» (например, ТО проведено и дата
    ушла в будущее) — отметка сбрасывается, и следующий вход снова оповестит.
    """

    class PlanKind(models.TextChoices):
        EQUIPMENT = "equipment", "Оборудование"
        TRANSPORT = "transport", "Транспорт"

    plan_kind = models.CharField(max_length=16, choices=PlanKind.choices)
    plan_id = models.PositiveIntegerField()
    # Статус, по которому уже оповестили: "due_soon" | "overdue" | "" (сброшен).
    notified_status = models.CharField(max_length=16, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["plan_kind", "plan_id"], name="uniq_maint_reminder_plan"),
        ]

    def __str__(self):
        return f"{self.plan_kind}:{self.plan_id}:{self.notified_status}"


class QueuedNotification(models.Model):
    """Отложенная доставка уведомления, попавшего вне «окна отправки» компании.

    Событие вне рабочего окна (Company.notify_window_*) не шлётся сразу, а
    кладётся сюда с временем ближайшего открытия окна (`scheduled_for`).
    Команда `send_queued_notifications` внутри окна сливает очередь и удаляет
    записи (доставка «выстрелил и забыл», как у синхронной отправки — без
    повторных попыток). Payload хранится примитивами, поэтому объект-источник к
    моменту отправки может быть уже изменён/удалён — повторный рендер не нужен.
    """

    class Channel(models.TextChoices):
        PUSH = "push", "Push"
        EMAIL = "email", "Email"

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="queued_notifications")
    channel = models.CharField(max_length=8, choices=Channel.choices)
    # Вид (NotificationKind) — для журналирования/группировки, не влияет на доставку.
    kind = models.CharField(max_length=32, blank=True)
    # Для push — готовый словарь payload (title/body/url/tag).
    # Для email — {"email_kind": ..., "template": ..., "context": {...}}.
    payload = models.JSONField(default=dict)
    # Момент, начиная с которого запись можно отправлять (открытие окна, UTC).
    scheduled_for = models.DateTimeField(db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Отложенное уведомление"
        verbose_name_plural = "Отложенные уведомления"
        ordering = ["scheduled_for", "id"]

    def __str__(self):
        return f"{self.user_id}:{self.channel}:{self.kind}"
