"""B22. Регламентное ТО транспорта — инварианты и каскады.

Механика идентична ТО оборудования; модель-независимое ядро (статус плана,
сортировка, сводка, каскад архива) — в core.maintenance. Здесь — только
транспорт-специфичные создание/каскады планов. Отличие от оборудования: ТО для
транспорта включено всегда (флага maintenance_enabled у типа нет).
"""

# Реэкспорт generic-ядра для обратной совместимости импортов (transport.views).
from core.maintenance import (  # noqa: F401
    DUE_SOON_DAYS,
    NOT_PLANNED,
    OVERDUE,
    DUE_SOON,
    SCHEDULED,
    add_months,
    is_plan_active,
    maintenance_summary,
    plan_sort_key,
    plan_status,
    set_regulation_archived,
)


def transport_maintenance_summary(transport, today=None):
    """Сводка индикации по экземпляру транспорта. ТО у транспорта включено всегда
    (кроме списанного). См. core.maintenance."""
    return maintenance_summary(transport, True, today)


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


def archive_transport_maintenance(transport):
    """Списание транспорта: индивидуальные регламенты → архив; все планы
    экземпляра отменены, даты обнулены."""
    from .models import MaintenanceRegulation

    MaintenanceRegulation.objects.filter(transport=transport, is_archived=False).update(is_archived=True)
    transport.maintenance_plans.update(is_cancelled=True, next_planned_date=None)
