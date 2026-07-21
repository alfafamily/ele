"""B13. Расчёт статуса техобслуживания (ТО) единицы оборудования.

Статус определяется плановой датой следующего ТО (Equipment.next_maintenance_date
— денормализация от последней записи MaintenanceRecord) относительно сегодняшнего
дня. Возвращается None, если у Типа выключен флаг maintenance_enabled — тогда ТО
для оборудования не ведётся и статус/индикаторы не показываются.
"""

from datetime import timedelta

from django.utils import timezone

# Окно «скоро» — за сколько дней до плановой даты статус становится «подходит».
DUE_SOON_DAYS = 7

# Значения статуса (совпадают с ключами лейблов на фронте).
NOT_PLANNED = "not_planned"
OVERDUE = "overdue"
DUE_SOON = "due_soon"
SCHEDULED = "scheduled"


def maintenance_status(*, enabled, next_date, today=None):
    """enabled — флаг Типа; next_date — Equipment.next_maintenance_date (date|None)."""
    if not enabled:
        return None
    if next_date is None:
        return NOT_PLANNED
    today = today or timezone.localdate()
    if next_date < today:
        return OVERDUE
    if next_date <= today + timedelta(days=DUE_SOON_DAYS):
        return DUE_SOON
    return SCHEDULED
