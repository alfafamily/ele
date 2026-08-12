"""Окно отправки уведомлений (push + письма).

Компания задаёт интервал [start, end) и часовой пояс, в которые допустима
рассылка. `within_window()` отвечает, можно ли слать «сейчас»; вне окна событие
кладётся в очередь (accounts.QueuedNotification) на момент `next_window_start()`.

Правила интервала:
- start < end  — обычное дневное окно: start <= t < end;
- start > end  — окно через полночь (напр. 22:00–06:00): t >= start ИЛИ t < end;
- start == end — круглосуточно, без ограничения по времени (аварийный выключатель).

Час трактуется в зоне компании (notify_window_timezone), а не в UTC; ZoneInfo
учитывает переход на летнее/зимнее время на каждом вызове (как backup/service).
"""
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from django.utils import timezone


def _company_tz(company) -> ZoneInfo:
    """Зона окна уведомлений; на случай удалённой из системы зоны — фолбэк UTC,
    чтобы cron/веб-запрос не падали."""
    try:
        return ZoneInfo(company.notify_window_timezone or "UTC")
    except (ZoneInfoNotFoundError, ValueError):
        return ZoneInfo("UTC")


def _load_company():
    from company.models import Company

    return Company.load()


def within_window(now=None, company=None) -> bool:
    """Можно ли отправлять уведомление «сейчас» (по окну компании)."""
    company = company or _load_company()
    start, end = company.notify_window_start, company.notify_window_end
    if start == end:
        return True  # круглосуточно
    tz = _company_tz(company)
    now = (now or timezone.now()).astimezone(tz)
    t = now.time()
    if start < end:
        return start <= t < end
    # окно через полночь
    return t >= start or t < end


def next_window_start(now=None, company=None) -> datetime:
    """Ближайший момент открытия окна (aware, в UTC) — время `scheduled_for` для
    отложенной записи. Вызывается только когда `within_window()` == False, но на
    всякий случай корректно вернёт «сейчас» и внутри круглосуточного окна."""
    company = company or _load_company()
    tz = _company_tz(company)
    now = (now or timezone.now()).astimezone(tz)
    start = company.notify_window_start
    if company.notify_window_start == company.notify_window_end:
        return now.astimezone(ZoneInfo("UTC"))
    # Кандидат — сегодняшнее начало окна; если оно уже прошло, берём завтрашнее.
    candidate = now.replace(hour=start.hour, minute=start.minute, second=0, microsecond=0)
    if candidate <= now:
        candidate = candidate + timedelta(days=1)
    return candidate.astimezone(ZoneInfo("UTC"))
