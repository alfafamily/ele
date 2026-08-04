from django.db import models


class BackgroundJobRun(models.Model):
    """B66. Структурированная запись о прогоне фоновой задачи (cron) или о сбое
    отправки уведомления — источник данных для «Настройки → Журнал фоновых
    задач». Раньше результаты фоновых процессов были видны только в логах
    сервера (docker compose logs cron); эта модель делает их видимыми в UI.

    Пишутся только РЕЗУЛЬТАТИВНЫЕ прогоны (что-то реально сделано) и ОШИБКИ;
    пустые noop-тики раз в минуту (делать нечего) не логируются — иначе таблица
    распухала бы на ~5760 строк/сутки. Старые записи автоматически подчищаются
    при записи (см. core.background_jobs.record_run, RETENTION_DAYS)."""

    class Job(models.TextChoices):
        BACKUP = "backup", "Резервное копирование"
        MAINTENANCE = "maintenance", "Напоминания о ТО"
        ANONYMIZE = "anonymize", "Обезличивание уволенных"
        STORAGE_MIGRATION = "storage_migration", "Перенос файлов хранилища"
        NOTIFICATIONS = "notifications", "Отправка уведомлений"

    class Status(models.TextChoices):
        OK = "ok", "Успешно"
        ERROR = "error", "Ошибка"

    # Задачи по расписанию — для плиток «последний запуск». NOTIFICATIONS сюда не
    # входит: это сбои отправки по факту действий, у них нет «прогона».
    SCHEDULED_JOBS = (Job.BACKUP, Job.MAINTENANCE, Job.ANONYMIZE, Job.STORAGE_MIGRATION)

    job = models.CharField(max_length=32, choices=Job.choices)
    status = models.CharField(max_length=8, choices=Status.choices)
    created_at = models.DateTimeField(auto_now_add=True)
    # Сколько сделано (копий/напоминаний/записей/файлов) — справочно.
    affected = models.PositiveIntegerField(default=0)
    # Человекочитаемая сводка результата или текст ошибки. БЕЗ персональных данных.
    detail = models.CharField(max_length=500, blank=True)

    class Meta:
        verbose_name = "Прогон фоновой задачи"
        verbose_name_plural = "Журнал фоновых задач"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["job", "-created_at"]),
            models.Index(fields=["-created_at"]),
        ]

    def __str__(self):
        return f"{self.get_job_display()} — {self.get_status_display()} ({self.created_at:%d.%m.%Y %H:%M})"


class TypeFileBase(models.Model):
    """B67. Общий файл, привязанный к Виду имущества (не к экземпляру): инструкции,
    драйверы, сертификаты, шаблоны — «библиотека Вида». Абстрактная база; каждый
    домен (оборудование/лицензии/транспорт) наследует её и добавляет FK на свой
    Тип. Бинарник живёт в StoredFile (единый слой хранилища).

    Файл добавляется в библиотеку в редакторе Вида; на форме экземпляра из этой
    библиотеки выбираются нужные файлы, и на карточке экземпляра показываются
    только выбранные (выбор — M2M на стороне экземпляра, см. `type_files`)."""

    stored_file = models.ForeignKey(
        "storage.StoredFile", on_delete=models.SET_NULL, null=True, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        abstract = True
        ordering = ["id"]
