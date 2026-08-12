"""Общие хелперы для тестов."""
from datetime import time


def open_notification_window():
    """Открыть окно отправки уведомлений «круглосуточно» (start == end), чтобы
    тесты немедленной доставки не зависели от текущего времени суток: при
    дефолтном окне 09:00–21:00 прогон вне этого интервала отправил бы
    уведомление в очередь (accounts.QueuedNotification), а не сразу."""
    from company.models import Company

    company = Company.load()
    company.notify_window_start = time(0, 0)
    company.notify_window_end = time(0, 0)
    company.save(update_fields=["notify_window_start", "notify_window_end"])
    return company
