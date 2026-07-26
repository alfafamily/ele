from django.db import models


class BackupRecord(models.Model):
    """Запись о резервной копии — метаданные копии. Сам артефакт (полный архив
    БД + файлы, B29) уезжает в одно или несколько назначений, статус по каждому —
    в BackupDestinationStatus. Собственная копия (own) дополнительно связана через
    `file` (StoredFile), из неё работает скачивание в UI."""

    class BackupType(models.TextChoices):
        MANUAL = "manual", "Вручную"
        AUTO = "auto", "Авто"

    class Format(models.TextChoices):
        V1_JSON = "v1_json", "JSON (устар.)"
        V2_ARCHIVE = "v2_archive", "Архив (БД + файлы)"

    created_at = models.DateTimeField(auto_now_add=True)
    backup_type = models.CharField(max_length=10, choices=BackupType.choices)
    # own-копия может отсутствовать (её назначение упало, а резервный S3 — нет),
    # поэтому nullable.
    file = models.ForeignKey(
        "storage.StoredFile", on_delete=models.CASCADE, related_name="+", null=True, blank=True
    )
    format = models.CharField(max_length=12, choices=Format.choices, default=Format.V2_ARCHIVE)
    encrypted = models.BooleanField(default=False)
    filename = models.CharField(max_length=255, blank=True)
    size = models.PositiveBigIntegerField(default=0)
    checksum = models.CharField(max_length=64, blank=True)
    app_version = models.CharField(max_length=32, blank=True)

    class Meta:
        verbose_name = "Резервная копия"
        verbose_name_plural = "Резервные копии"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.get_backup_type_display()} — {self.created_at:%d.%m.%Y %H:%M}"


class BackupDestinationStatus(models.Model):
    """Результат выгрузки копии в конкретное назначение (частичный успех: одно
    назначение могло удаться, другое — нет)."""

    class Destination(models.TextChoices):
        OWN = "own", "Хранилище приложения"
        SECONDARY_S3 = "secondary_s3", "Отдельный S3 для бэкапов"

    backup = models.ForeignKey(BackupRecord, on_delete=models.CASCADE, related_name="destinations")
    destination = models.CharField(max_length=16, choices=Destination.choices)
    ok = models.BooleanField(default=False)
    error = models.TextField(blank=True)
    object_key = models.CharField(max_length=500, blank=True)  # для secondary_s3
    stored_file = models.ForeignKey(
        "storage.StoredFile", on_delete=models.SET_NULL, related_name="+", null=True, blank=True
    )  # для own
    size = models.PositiveBigIntegerField(default=0)

    class Meta:
        verbose_name = "Статус назначения копии"
        verbose_name_plural = "Статусы назначений копии"
        unique_together = [("backup", "destination")]

    def __str__(self):
        return f"{self.get_destination_display()} — {'ок' if self.ok else 'ошибка'}"
