"""B22. Регламентное ТО транспорта — статус планов и инварианты.

Механика идентична ТО оборудования; модель-независимые хелперы (статус плана по
дате, ключ сортировки, сдвиг даты на месяцы, окно «скоро») переиспользуются из
equipment.maintenance. Здесь — только транспорт-специфичные сводка и каскады.
Отличие от оборудования: ТО для транспорта включено всегда (флага
maintenance_enabled у типа нет), поэтому в сводке его не проверяем.
"""

from django.utils import timezone

# Переиспользуем generic-хелперы и константы (не завязаны на модели equipment).
from equipment.maintenance import (  # noqa: F401
    DUE_SOON_DAYS,
    NOT_PLANNED,
    OVERDUE,
    DUE_SOON,
    SCHEDULED,
    add_months,
    is_plan_active,
    plan_sort_key,
    plan_status,
)
from equipment.maintenance import _CRITICAL_RANK


def transport_maintenance_summary(transport, today=None):
    """Сводка индикации по экземпляру для списка/карточки:
      {critical: overdue|due_soon|scheduled|None, has_unplanned: bool, enabled}.
    Для транспорта ТО включено всегда → enabled=True (кроме списанного).
    Использует prefetched maintenance_plans__regulation (без доп. запросов)."""
    result = {"critical": None, "has_unplanned": False, "enabled": True}
    if transport.is_written_off:
        result["enabled"] = False
        return result

    today = today or timezone.localdate()
    best = 0
    for plan in transport.maintenance_plans.all():
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

def create_plans_for_transport(transport):
    """При создании экземпляра — план на каждый активный регламент его типа."""
    from .models import MaintenanceRegulation, TransportMaintenancePlan

    regs = MaintenanceRegulation.objects.filter(
        transport_type=transport.transport_type, is_archived=False
    )
    TransportMaintenancePlan.objects.bulk_create(
        [TransportMaintenancePlan(transport=transport, regulation=r) for r in regs],
        ignore_conflicts=True,
    )


def create_plans_for_type_regulation(regulation):
    """При создании регламента типа — план у всего активного (не списанного)
    транспорта этого типа."""
    from .models import Transport, TransportMaintenancePlan

    items = Transport.objects.filter(
        transport_type=regulation.transport_type, is_written_off=False
    )
    TransportMaintenancePlan.objects.bulk_create(
        [TransportMaintenancePlan(transport=t, regulation=regulation) for t in items],
        ignore_conflicts=True,
    )


def create_plan_for_individual_regulation(regulation):
    """При создании индивидуального регламента — план на его транспорт."""
    from .models import TransportMaintenancePlan

    TransportMaintenancePlan.objects.get_or_create(
        transport=regulation.transport, regulation=regulation
    )


def set_regulation_archived(regulation, archived):
    """Архивирование/возврат регламента с каскадом на планы."""
    regulation.is_archived = archived
    regulation.save(update_fields=["is_archived"])
    regulation.plans.update(is_cancelled=archived, next_planned_date=None)


def archive_transport_maintenance(transport):
    """Списание транспорта: индивидуальные регламенты → архив; все планы
    экземпляра отменены, даты обнулены."""
    from .models import MaintenanceRegulation

    MaintenanceRegulation.objects.filter(transport=transport, is_archived=False).update(is_archived=True)
    transport.maintenance_plans.update(is_cancelled=True, next_planned_date=None)
