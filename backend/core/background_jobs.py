"""B66. Запись прогонов фоновых задач в журнал (core.models.BackgroundJobRun).

Вызывается из cron-команд (бэкап/ТО/обезличивание/перенос файлов) и из мест
отправки уведомлений. Никогда не бросает исключение наружу — журналирование не
должно ронять саму фоновую задачу. Пустые noop-прогоны вызывающий просто не
записывает (не зовёт record_run).
"""
import logging
from datetime import timedelta

from django.utils import timezone

from .models import BackgroundJobRun

logger = logging.getLogger(__name__)

# Глубина хранения журнала. Записи старше подчищаются при каждой записи.
RETENTION_DAYS = 90


def record_run(job, status, *, affected=0, detail=""):
    """Записать результативный прогон или ошибку фоновой задачи в журнал.

    job/status — значения BackgroundJobRun.Job/.Status. detail — короткая сводка
    результата или текст ошибки (без ПДн). Ошибки записи в журнал глушим (лог),
    чтобы не сорвать саму задачу."""
    try:
        BackgroundJobRun.objects.create(
            job=job, status=status, affected=affected, detail=(detail or "")[:500]
        )
        _prune()
    except Exception:  # noqa: BLE001 — журнал не должен ронять фоновую задачу
        logger.exception("Не удалось записать прогон в журнал фоновых задач (%s/%s)", job, status)


def record_error(job, detail):
    """Записать ошибку прогона задачи по расписанию."""
    record_run(job, BackgroundJobRun.Status.ERROR, detail=detail)


def record_notification_failure(detail):
    """Записать сбой отправки уведомления (письмо/push). Показывается в ленте
    журнала как событие «Отправка уведомлений» и учитывается в треугольнике-
    предупреждении в течение 24 часов до просмотра."""
    record_run(BackgroundJobRun.Job.NOTIFICATIONS, BackgroundJobRun.Status.ERROR, detail=detail)


def _prune():
    cutoff = timezone.now() - timedelta(days=RETENTION_DAYS)
    BackgroundJobRun.objects.filter(created_at__lt=cutoff).delete()
