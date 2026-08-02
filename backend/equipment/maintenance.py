"""B13+. Регламентное техобслуживание (ТО) оборудования: инварианты и каскады.

ТО ведётся по регламентам (MaintenanceRegulation) — типовым (наследуются всем
оборудованием типа) и индивидуальным. Состояние регламента для конкретного
экземпляра хранит EquipmentMaintenancePlan (плановая дата + признак отмены).
Модель-независимое ядро (статус плана, сортировка, сводка, каскад архива) — в
core.maintenance; здесь — только специфичные для оборудования создание/каскады.
"""

# Реэкспорт generic-ядра для обратной совместимости импортов (equipment.views,
# core.management ...). Единственный источник истины — core.maintenance.
from core.maintenance import (  # noqa: F401
    DUE_SOON,
    DUE_SOON_DAYS,
    NOT_PLANNED,
    ON_DEMAND_RANK,
    OVERDUE,
    SCHEDULED,
    MaintenanceError,
    add_months,
    is_plan_active,
    maintenance_status_condition,
    maintenance_summary,
    perform_maintenance,
    plan_sort_key,
    plan_status,
    set_regulation_archived,
)


def equipment_maintenance_summary(equipment, today=None):
    """Сводка индикации по экземпляру оборудования. У оборудования ТО может быть
    выключено флагом типа (maintenance_enabled). См. core.maintenance."""
    return maintenance_summary(equipment, bool(equipment.equipment_type.maintenance_enabled), today)


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


def archive_equipment_maintenance(equipment):
    """Списание оборудования: индивидуальные регламенты → архив; все планы
    экземпляра отменены, даты обнулены (контроль/проведение недоступны)."""
    from .models import MaintenanceRegulation

    MaintenanceRegulation.objects.filter(equipment=equipment, is_archived=False).update(is_archived=True)
    equipment.maintenance_plans.update(is_cancelled=True, next_planned_date=None)
