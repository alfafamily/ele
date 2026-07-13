from django.db import models


class BackupRecord(models.Model):
    """Запись о резервной копии (ТЗ §5.5.3) — сам JSON лежит через
    StoredFile (та же абстракция Local/S3, что и остальные файлы, §8.3),
    здесь только метаданные."""

    class BackupType(models.TextChoices):
        MANUAL = "manual", "Вручную"
        AUTO = "auto", "Авто"

    created_at = models.DateTimeField(auto_now_add=True)
    backup_type = models.CharField(max_length=10, choices=BackupType.choices)
    file = models.ForeignKey("storage.StoredFile", on_delete=models.CASCADE, related_name="+")

    class Meta:
        verbose_name = "Резервная копия"
        verbose_name_plural = "Резервные копии"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.get_backup_type_display()} — {self.created_at:%d.%m.%Y %H:%M}"
