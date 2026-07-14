from django.db import models


class StoredFile(models.Model):
    """Единый слой косвенности над файлами — Company.logo,
    Employee.avatar, файловые EAV-значения ссылаются сюда, а не на путь
    напрямую. Смена хранилища всего инстанса = обновление backend/path
    в этих строках, без необходимости трогать N разных таблиц-ссылок."""

    class Backend(models.TextChoices):
        LOCAL = "local", "Локально"
        S3 = "s3", "S3"

    class MigrationStatus(models.TextChoices):
        NONE = "none", "—"
        IN_PROGRESS = "in_progress", "Копируется"
        DONE = "done", "Завершено"
        ERROR = "error", "Ошибка"

    backend = models.CharField(max_length=10, choices=Backend.choices)
    path = models.CharField(max_length=500)
    original_filename = models.CharField(max_length=255, blank=True)
    content_type = models.CharField(max_length=100, blank=True)
    size = models.PositiveBigIntegerField(default=0)
    checksum = models.CharField(max_length=64, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    # Ошибочные записи не подхватываются автоматически следующим тиком cron
    # (см. storage/management/commands/migrate_storage_files.py) — только
    # по явному запросу Администратора ("доступно для просмотра и
    # повторного запуска переноса именно по ним").
    migration_status = models.CharField(max_length=15, choices=MigrationStatus.choices, default=MigrationStatus.NONE)
    migration_error = models.TextField(blank=True)

    class Meta:
        verbose_name = "Файл"
        verbose_name_plural = "Файлы"

    def __str__(self):
        return self.original_filename or self.path

    @property
    def url(self) -> str:
        from .backends import get_backend

        return get_backend(self.backend).url(self.path)
