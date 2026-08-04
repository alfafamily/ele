from datetime import time

from django.core.exceptions import ValidationError
from django.db import models


class Company(models.Model):
    """Компания — единственный объект в БД копии системы ."""

    class StorageMode(models.TextChoices):
        LOCAL = "local", "Локально"
        S3 = "s3", "S3"

    # Логотип не более 600×600 — валидируется на уровне сериализатора.
    # FK на StoredFile, не прямой путь к файлу (Фаза 5).
    logo = models.ForeignKey(
        "storage.StoredFile", verbose_name="Лого", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    inn = models.CharField("ИНН", max_length=32, blank=True)
    name = models.CharField("Название компании", max_length=255, blank=True)
    domain = models.CharField("Домен компании", max_length=255, blank=True)
    # B14: разрешена ли самостоятельная регистрация. Выключен — регистрация
    # только по приглашению администратора; вход через Яндекс ID не заводит
    # новый аккаунт. По умолчанию включён (текущее поведение сохраняется).
    open_registration = models.BooleanField("Открытая регистрация", default=True)
    # B32: снимать ли слепок устройства при подтверждении/отказе сотрудником
    # закрепления (браузер/ОС/IP/экран/часовой пояс). По умолчанию ВЫКЛ (сбор ПДн).
    # Слепок снимается только когда решение принимает сам сотрудник-пользователь.
    device_snapshot_enabled = models.BooleanField("Сбор слепков устройств при акцепте", default=False)
    # B51-R1: через сколько месяцев после увольнения сотрудника его ПДн
    # автоматически обезличиваются (ФИО/аватар/слепки/учётка). 0 — авто-
    # обезличивание выключено (только вручную кнопкой «Обезличить запись»).
    anonymize_after_months = models.PositiveSmallIntegerField(
        "Автообезличивание уволенных через, месяцев", default=12
    )
    # Список IP/подсетей (CIDR-строки); блокирует весь сервис вне списка.
    ip_allowlist = models.JSONField("Ограничение доступа по IP", default=list, blank=True)
    # B9: контролируемый доступ в служебную Django-админку (/django_admin).
    # Выключено по умолчанию — раздел закрыт (middleware отдаёт 404). Включённый
    # доступ ВСЕГДА ограничен своим отдельным IP-списком (не тем, что вход в
    # приложение): пустой admin_access_ips = закрыто. Права на редактирование в
    # админке даёт только is_superuser (галка у пользователя), по умолчанию — лишь
    # просмотр. При выключении флага is_superuser снимается у всех (см.
    # CompanySettingsSerializer.update).
    admin_access_enabled = models.BooleanField("Доступ к админ-панели Django", default=False)
    admin_access_ips = models.JSONField("Разрешённые IP админ-панели", default=list, blank=True)
    storage_mode = models.CharField(
        "Хранилище файлов", max_length=10, choices=StorageMode.choices, default=StorageMode.LOCAL
    )
    # Максимальный размер одного загружаемого файла (реквизиты-файлы, план
    # помещения) в мегабайтах. Настраивается администратором; аватары и лого —
    # свой фиксированный лимит, эта настройка на них не распространяется.
    max_upload_mb = models.PositiveIntegerField("Максимальный размер файла (МБ)", default=20)
    # Секреты интеграций (S3/капча/Яндекс ID) сознательно не хранятся здесь —
    # только в .env сервера: объект Company целиком попадает в
    # JSON-бэкап, секреты в бэкапе — риск, не архитектурная случайность.

    # Автокопирование — глубина хранения применяется только к
    # backup_type=AUTO, ручные копии не подчищаются автоматически.
    auto_backup_enabled = models.BooleanField("Автокопирование включено", default=False)
    auto_backup_time = models.TimeField("Время автокопирования", default=time(3, 0))
    # Часовой пояс (IANA), в котором трактуется auto_backup_time. Дефолт "UTC" —
    # у существующих компаний время задавалось по UTC-часам сервера, так что
    # зона UTC сохраняет прежнее поведение расписания без пересчёта. Cron
    # (backup/service.py) вычисляет «сейчас» в этой зоне, DST учитывается.
    auto_backup_timezone = models.CharField("Часовой пояс автокопий", max_length=64, default="UTC")
    auto_backup_retention = models.PositiveSmallIntegerField("Хранить последних копий", default=30)

    # B29: ЕДИНОЕ назначение копий (и ручных, и авто) — либо хранилище инстанса,
    # либо отдельный резервный S3 (креды в .env BACKUP_S3_*; секреты в Company
    # нельзя — она уходит в бэкап). Настройка вынесена в «Системные» рядом с
    # выбором хранилища приложения.
    class BackupDestination(models.TextChoices):
        OWN = "own", "Хранилище приложения"
        SECONDARY_S3 = "secondary_s3", "S3 для backup"

    backup_destination = models.CharField(
        "Хранилище резервных копий", max_length=16, choices=BackupDestination.choices, default=BackupDestination.OWN
    )

    # B66. Когда администратор последний раз открывал «Журнал фоновых задач».
    # Используется треугольником-предупреждением: свежие сбои отправки уведомлений
    # (за 24 ч) гаснут, как только журнал открыт. null — журнал ещё не открывали.
    background_journal_seen_at = models.DateTimeField("Журнал фоновых задач просмотрен", null=True, blank=True)

    # Автонумератор учётных номеров (B2). У каждого списка объектов свой префикс
    # и свой сквозной счётчик. Порядковый номер только растёт и никогда не
    # переиспользуется — при генерации значение сгорает, даже если объект не
    # сохранён. Смена префикса счётчик НЕ сбрасывает.
    equipment_number_prefix = models.CharField("Префикс номеров оборудования", max_length=16, default="EQUIP")
    key_number_prefix = models.CharField("Префикс номеров ключей", max_length=16, default="KEY")
    pass_number_prefix = models.CharField("Префикс номеров пропусков", max_length=16, default="PASS")
    transport_number_prefix = models.CharField("Префикс номеров транспорта", max_length=16, default="TS")
    equipment_number_seq = models.PositiveIntegerField("Счётчик номеров оборудования", default=0)
    key_number_seq = models.PositiveIntegerField("Счётчик номеров ключей", default=0)
    pass_number_seq = models.PositiveIntegerField("Счётчик номеров пропусков", default=0)
    transport_number_seq = models.PositiveIntegerField("Счётчик номеров транспорта", default=0)

    class Meta:
        verbose_name = "Компания"
        verbose_name_plural = "Компания"

    def __str__(self):
        return self.name or "Компания"

    def save(self, *args, **kwargs):
        self.pk = 1  # singleton: единственная запись в таблице 
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("Компания — синглтон, объект нельзя удалить.")

    @classmethod
    def load(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj


class PdnDocument(models.Model):
    """B51-R2. Версия документа по обработке ПДн, на который субъект даёт согласие.

    Три вида: Согласие / Политика / Положение. Оператор задаёт документ ссылкой
    ИЛИ файлом — в любом случае система хранит ЛОКАЛЬНУЮ копию (`stored_file`):
    при вводе ссылки файл скачивается по ней (см. company/pdn.py). Каждое изменение
    документа создаёт новую строку-версию (старые сохраняются, чтобы согласие
    ссылалось ровно на тот файл, что действовал на момент его выражения). Текущая
    версия вида — единственная строка с `is_current=True`.
    """

    class Kind(models.TextChoices):
        CONSENT = "consent", "Согласие на обработку ПДн"
        POLICY = "policy", "Политика обработки ПДн"
        REGULATION = "regulation", "Положение в области обработки ПДн"

    class SourceMode(models.TextChoices):
        LINK = "link", "Ссылка"
        FILE = "file", "Файл"

    kind = models.CharField("Вид документа", max_length=12, choices=Kind.choices)
    source_mode = models.CharField("Способ задания", max_length=4, choices=SourceMode.choices)
    # Исходная ссылка (для source_mode=link) — сам файл всё равно хранится локально.
    source_url = models.CharField("Ссылка на документ", max_length=1000, blank=True)
    stored_file = models.ForeignKey(
        "storage.StoredFile", verbose_name="Файл документа", on_delete=models.PROTECT, related_name="+"
    )
    is_current = models.BooleanField("Текущая версия", default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Документ по обработке ПДн"
        verbose_name_plural = "Документы по обработке ПДн"
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["kind", "is_current"])]

    def __str__(self):
        return f"{self.get_kind_display()} ({self.created_at:%d.%m.%Y})"
