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
    # Список IP/подсетей (CIDR-строки); блокирует весь сервис вне списка.
    ip_allowlist = models.JSONField("Ограничение доступа по IP", default=list, blank=True)
    storage_mode = models.CharField(
        "Хранилище файлов", max_length=10, choices=StorageMode.choices, default=StorageMode.LOCAL
    )
    # Секреты интеграций (S3/капча/Яндекс ID) сознательно не хранятся здесь —
    # только в .env сервера: объект Company целиком попадает в
    # JSON-бэкап, секреты в бэкапе — риск, не архитектурная случайность.

    # Автокопирование — глубина хранения применяется только к
    # backup_type=AUTO, ручные копии не подчищаются автоматически.
    auto_backup_enabled = models.BooleanField("Автокопирование включено", default=False)
    auto_backup_time = models.TimeField("Время автокопирования", default=time(3, 0))
    auto_backup_retention = models.PositiveSmallIntegerField("Хранить последних копий", default=30)

    # Автонумератор учётных номеров (B2). У каждого списка объектов свой префикс
    # и свой сквозной счётчик. Порядковый номер только растёт и никогда не
    # переиспользуется — при генерации значение сгорает, даже если объект не
    # сохранён. Смена префикса счётчик НЕ сбрасывает.
    equipment_number_prefix = models.CharField("Префикс номеров оборудования", max_length=16, default="EQUIP")
    key_number_prefix = models.CharField("Префикс номеров ключей", max_length=16, default="KEY")
    pass_number_prefix = models.CharField("Префикс номеров пропусков", max_length=16, default="PASS")
    equipment_number_seq = models.PositiveIntegerField("Счётчик номеров оборудования", default=0)
    key_number_seq = models.PositiveIntegerField("Счётчик номеров ключей", default=0)
    pass_number_seq = models.PositiveIntegerField("Счётчик номеров пропусков", default=0)

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
