"""Модель-независимое ядро регламентного ТО (B13+/B22).

ТО оборудования и транспорта устроены одинаково: статус плана по плановой дате,
сортировка планов, сводная индикация, каскад архивирования регламента. Здесь —
generic-часть, не завязанная на конкретные модели; equipment/transport
переиспользуют её и добавляют лишь модель-специфичные создание/каскады планов.
"""

import calendar
from datetime import timedelta

from django.db.models import Exists, OuterRef
from django.utils import timezone


def add_months(d, months):
    """Дата + N месяцев без внешних зависимостей (клампит день к длине месяца)."""
    month = d.month - 1 + months
    year = d.year + month // 12
    month = month % 12 + 1
    day = min(d.day, calendar.monthrange(year, month)[1])
    return d.replace(year=year, month=month, day=day)


# Окно «скоро» — за сколько дней до плановой даты статус становится «подходит».
DUE_SOON_DAYS = 7

# Значения статуса плана (совпадают с ключами лейблов на фронте).
NOT_PLANNED = "not_planned"
OVERDUE = "overdue"
DUE_SOON = "due_soon"
SCHEDULED = "scheduled"

# Приоритет «самого критичного» статуса для сводной индикации в списке.
_CRITICAL_RANK = {OVERDUE: 3, DUE_SOON: 2, SCHEDULED: 1}
# Порядок сортировки планов (пикер регламентов и блок «Обслуживание»):
# просроченные → подходят → запланированы → без даты → по потребности.
_SORT_RANK = {OVERDUE: 0, DUE_SOON: 1, SCHEDULED: 2, NOT_PLANNED: 3}
ON_DEMAND_RANK = 4


def plan_status(next_date, today=None):
    """Статус одного плана по плановой дате (для активного, неон-деманд плана)."""
    if next_date is None:
        return NOT_PLANNED
    today = today or timezone.localdate()
    if next_date < today:
        return OVERDUE
    if next_date <= today + timedelta(days=DUE_SOON_DAYS):
        return DUE_SOON
    return SCHEDULED


def plan_sort_key(plan, today=None):
    """Ключ сортировки плана: (ранг статуса, плановая дата, id). У on-demand —
    отдельный последний ранг."""
    reg = plan.regulation
    if reg.on_demand:
        rank = ON_DEMAND_RANK
    else:
        rank = _SORT_RANK[plan_status(plan.next_planned_date, today)]
    # None-дата сортируется в конец своей группы.
    date_key = plan.next_planned_date or timezone.localdate() + timedelta(days=3650)
    return (rank, date_key, plan.id)


def is_plan_active(plan):
    """План активен: регламент не в архиве и план не отменён для экземпляра.
    (Списанный объект каскадом получает is_cancelled=True — отдельной проверки
    is_written_off здесь не требуется.)"""
    return not plan.is_cancelled and not plan.regulation.is_archived


def maintenance_summary(instance, enabled, today=None):
    """Сводка индикации по экземпляру для списка/карточки:
      {critical: overdue|due_soon|scheduled|None, has_unplanned: bool, enabled}.
    `enabled` — включено ли ТО у экземпляра (у оборудования зависит от флага
    типа, у транспорта — всегда True). Списанный объект → enabled=False.
    critical — самый критичный статус среди активных неон-деманд планов;
    has_unplanned — есть активный неон-деманд план без назначенной даты.
    Использует prefetched maintenance_plans__regulation (без доп. запросов)."""
    result = {"critical": None, "has_unplanned": False, "enabled": enabled}
    if not enabled or instance.is_written_off:
        result["enabled"] = False
        return result

    today = today or timezone.localdate()
    best = 0
    for plan in instance.maintenance_plans.all():
        if not is_plan_active(plan) or plan.regulation.on_demand:
            continue
        status = plan_status(plan.next_planned_date, today)
        if status == NOT_PLANNED:
            result["has_unplanned"] = True
            continue
        rank = _CRITICAL_RANK[status]
        if rank > best:
            best = rank
            result["critical"] = status
    return result


def maintenance_status_condition(params, *, plan_model, owner_field):
    """B13+/B22. Условие фильтра списка по статусу ТО из query-параметров
    ``to_overdue`` / ``to_due`` / ``to_unset`` (каждый ``"1"``). Считается по
    активным планам (регламент не архивный, план не отменён, регламент не «по
    потребности»); несколько выбранных статусов объединяются через ИЛИ.

    Возвращает выражение для ``.filter(cond)`` либо ``None``, если ни один статус
    не запрошен (фильтр не применяется). Идентично у оборудования и транспорта —
    различаются только модель плана и имя FK на объект:

    * ``plan_model``  — EquipmentMaintenancePlan / TransportMaintenancePlan;
    * ``owner_field`` — имя FK на объект в плане (``"equipment"`` / ``"transport"``).
    """
    to_due = params.get("to_due") == "1"
    to_overdue = params.get("to_overdue") == "1"
    to_unset = params.get("to_unset") == "1"
    if not (to_due or to_overdue or to_unset):
        return None
    today = timezone.localdate()
    active = plan_model.objects.filter(**{
        owner_field: OuterRef("pk"),
        "is_cancelled": False,
        "regulation__is_archived": False,
        "regulation__on_demand": False,
    })
    cond = None
    if to_overdue:
        cond = Exists(active.filter(next_planned_date__lt=today))
    if to_due:
        due = Exists(active.filter(
            next_planned_date__gte=today,
            next_planned_date__lte=today + timedelta(days=DUE_SOON_DAYS),
        ))
        cond = due if cond is None else (cond | due)
    if to_unset:
        unset = Exists(active.filter(next_planned_date__isnull=True))
        cond = unset if cond is None else (cond | unset)
    return cond


def set_regulation_archived(regulation, archived):
    """Архивирование/возврат регламента с каскадом на планы.
    Архив → все планы отменены, даты обнулены. Возврат → отмена снята, даты
    обнулены (нужно назначить заново)."""
    regulation.is_archived = archived
    regulation.save(update_fields=["is_archived"])
    regulation.plans.update(is_cancelled=archived, next_planned_date=None)
