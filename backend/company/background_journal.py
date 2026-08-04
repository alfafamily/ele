"""B66. Признак треугольника-предупреждения у пункта меню «Журнал фоновых задач»
(и у иконки «Настройки»). Логика «текущего состояния», как у storageLow и
duplicatesCount — не «непрочитанное навсегда».
"""
from datetime import timedelta

from django.utils import timezone

from core.models import BackgroundJobRun

# Окно, в течение которого сбой отправки уведомлений держит треугольник (если не
# просмотрен раньше).
NOTIFICATION_ALERT_WINDOW = timedelta(hours=24)


def journal_alert(company) -> bool:
    """Треугольник горит, когда выполнено ЛЮБОЕ из:
    (a) последний прогон хотя бы одной задачи по расписанию завершился ошибкой
        (самогаснет: следующий успешный прогон сделает статус ok);
    (b) был сбой отправки уведомлений за последние 24 ч, ещё не просмотренный
        (гаснет при открытии журнала — по метке background_journal_seen_at)."""
    # (a) — текущее состояние задач по расписанию.
    for job in BackgroundJobRun.SCHEDULED_JOBS:
        last = BackgroundJobRun.objects.filter(job=job).order_by("-created_at").first()
        if last is not None and last.status == BackgroundJobRun.Status.ERROR:
            return True

    # (b) — свежие непросмотренные сбои отправки уведомлений.
    since = timezone.now() - NOTIFICATION_ALERT_WINDOW
    seen = company.background_journal_seen_at
    threshold = max(since, seen) if seen else since
    return BackgroundJobRun.objects.filter(
        job=BackgroundJobRun.Job.NOTIFICATIONS,
        status=BackgroundJobRun.Status.ERROR,
        created_at__gt=threshold,
    ).exists()
