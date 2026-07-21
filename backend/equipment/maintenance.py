"""B13+. Регламентное техобслуживание (ТО): статус планов и инварианты.

ТО ведётся по регламентам (MaintenanceRegulation) — типовым (наследуются всем
оборудованием типа) и индивидуальным. Состояние регламента для конкретного
экземпляра хранит EquipmentMaintenancePlan (плановая дата + признак отмены).
Статус/индикация/фильтры считаются по активным планам, а не по одной дате.
"""

import calendar
from datetime import timedelta

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
    (Списанное оборудование каскадом получает is_cancelled=True — отдельной
    проверки is_written_off здесь не требуется.)"""
    return not plan.is_cancelled and not plan.regulation.is_archived


def equipment_maintenance_summary(equipment, today=None):
    """Сводка индикации по экземпляру для списка/карточки:
      {critical: overdue|due_soon|scheduled|None, has_unplanned: bool, enabled}.
    critical — самый критичный статус среди активных неон-деманд планов;
    has_unplanned — есть активный неон-деманд план без назначенной даты.
    Использует prefetched maintenance_plans__regulation (без доп. запросов)."""
    enabled = bool(equipment.equipment_type.maintenance_enabled)
    result = {"critical": None, "has_unplanned": False, "enabled": enabled}
    if not enabled or equipment.is_written_off:
        return result

    today = today or timezone.localdate()
    best = 0
    for plan in equipment.maintenance_plans.all():
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


# --- Инварианты создания/каскадов планов -----------------------------------

def create_plans_for_equipment(equipment):
    """При создании экземпляра — план на каждый активный регламент его типа."""
    from .models import EquipmentMaintenancePlan, MaintenanceRegulation

    regs = MaintenanceRegulation.objects.filter(
        equipment_type=equipment.equipment_type, is_archived=False
    )
    EquipmentMaintenancePlan.objects.bulk_create(
        [EquipmentMaintenancePlan(equipment=equipment, regulation=r) for r in regs],
        ignore_conflicts=True,
    )


def create_plans_for_type_regulation(regulation):
    """При создании регламента типа — план у всего активного (не списанного)
    оборудования этого типа."""
    from .models import Equipment, EquipmentMaintenancePlan

    eqs = Equipment.objects.filter(
        equipment_type=regulation.equipment_type, is_written_off=False
    )
    EquipmentMaintenancePlan.objects.bulk_create(
        [EquipmentMaintenancePlan(equipment=e, regulation=regulation) for e in eqs],
        ignore_conflicts=True,
    )


def create_plan_for_individual_regulation(regulation):
    """При создании индивидуального регламента — план на его оборудование."""
    from .models import EquipmentMaintenancePlan

    EquipmentMaintenancePlan.objects.get_or_create(
        equipment=regulation.equipment, regulation=regulation
    )


def set_regulation_archived(regulation, archived):
    """Архивирование/возврат регламента с каскадом на планы.
    Архив → все планы отменены, даты обнулены. Возврат → отмена снята, даты
    обнулены (нужно назначить заново)."""
    regulation.is_archived = archived
    regulation.save(update_fields=["is_archived"])
    regulation.plans.update(is_cancelled=archived, next_planned_date=None)


def archive_equipment_maintenance(equipment):
    """Списание оборудования: индивидуальные регламенты → архив; все планы
    экземпляра отменены, даты обнулены (контроль/проведение недоступны)."""
    from .models import MaintenanceRegulation

    MaintenanceRegulation.objects.filter(equipment=equipment, is_archived=False).update(is_archived=True)
    equipment.maintenance_plans.update(is_cancelled=True, next_planned_date=None)
