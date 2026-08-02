"""Модель-независимое ядро регламентного ТО (B13+/B22).

ТО оборудования и транспорта устроены одинаково: статус плана по плановой дате,
сортировка планов, сводная индикация, каскад архивирования регламента. Здесь —
generic-часть, не завязанная на конкретные модели; equipment/transport
переиспользуют её и добавляют лишь модель-специфичные создание/каскады планов.
"""

import calendar
from datetime import timedelta

from django.db import transaction
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


class MaintenanceError(Exception):
    """Отказ доменной операции ТО. Несёт человекочитаемое ``detail`` и HTTP
    ``status`` — вью переводит его в ``Response({"detail": ...}, status=...)``.
    Позволяет держать проверки бизнес-правил в сервисе, а формирование ответа —
    во вью."""

    def __init__(self, detail, status):
        super().__init__(detail)
        self.detail = detail
        self.status = status


def perform_maintenance(
    *,
    instance,
    owner_field,
    owner_label,
    plan_model,
    record_model,
    item_model,
    data,
    actor,
    extra_record_fields=None,
    extra_validate=None,
):
    """B13+/B22. Провести ТО по регламенту (или «Внеплановое» — regulation=null).
    Проверяет бизнес-правила, атомарно создаёт запись ``record_model`` со снимком
    позиций (в т.ч. отменённых с причиной) и, для периодического регламента,
    переносит новую плановую дату в план (``plan_model``). Затем шлёт уведомление
    «Выполненное ТО». Возвращает созданную запись.

    Устроено одинаково у оборудования и транспорта — различаются только модели
    и имя FK на объект; параметризовано:

    * ``instance``      — экземпляр объекта (Equipment / Transport);
    * ``owner_field``   — имя FK на объект (``"equipment"`` / ``"transport"``);
    * ``owner_label``   — родительный падеж для сообщения о недоступном регламенте
      (``"оборудования"`` / ``"транспорта"``);
    * ``plan_model``    — EquipmentMaintenancePlan / TransportMaintenancePlan;
    * ``record_model``/``item_model`` — MaintenanceRecord(Item) соответствующего
      приложения;
    * ``data``          — validated_data ``PerformMaintenanceSerializer``;
    * ``actor``         — пользователь-исполнитель (request.user);
    * ``extra_record_fields`` — доп. поля записи (у транспорта — ``mileage``);
    * ``extra_validate`` — опц. коллбэк ``fn(instance, data)`` для проверок,
      специфичных для объекта (у транспорта — контроль пробега); вызывается
      между проверкой позиций и проверкой даты, чтобы сохранить прежний порядок
      выдачи ошибок. Должен поднимать ``MaintenanceError`` при нарушении.

    Нарушения бизнес-правил поднимают ``MaintenanceError`` (вью → HTTP-ответ).
    """
    regulation = data.get("regulation")
    plan = None
    if regulation is not None:
        plan = plan_model.objects.filter(**{owner_field: instance, "regulation": regulation}).first()
        if plan is None or plan.is_cancelled or regulation.is_archived:
            raise MaintenanceError(f"Регламент недоступен для этого {owner_label}.", 409)

    # Хотя бы одна неотменённая работа/материал обязательна.
    items = data["items"]
    active_items = [i for i in items if not i["is_cancelled"]]
    if not active_items:
        raise MaintenanceError("Добавьте хотя бы одну (неотменённую) работу или материал.", 400)

    if extra_validate is not None:
        extra_validate(instance, data)

    # Дата следующего ТО: обязательна и ограничена для периодического
    # регламента; у «по потребности» и «Внепланового» даты нет.
    is_periodic = regulation is not None and not regulation.on_demand
    next_date = data.get("next_planned_date")
    if is_periodic:
        today = timezone.localdate()
        if next_date is None:
            raise MaintenanceError("Укажите дату следующего ТО.", 400)
        if next_date < today:
            raise MaintenanceError("Дата следующего ТО не может быть в прошлом.", 400)
        max_date = add_months(today, regulation.period_months)
        if next_date > max_date:
            raise MaintenanceError(
                f"Дата следующего ТО не может быть позже расчётной ({max_date:%d.%m.%Y}).", 400
            )
    else:
        next_date = None

    with transaction.atomic():
        record = record_model.objects.create(
            regulation=regulation,
            regulation_name=(regulation.name if regulation else ""),
            next_planned_date=next_date,
            prior_planned_date=(plan.next_planned_date if plan else None),
            comment=(data.get("comment") or "").strip(),
            created_by=actor if actor.is_authenticated else None,
            **{owner_field: instance},
            **(extra_record_fields or {}),
        )
        item_model.objects.bulk_create([
            item_model(
                record=record,
                kind=item["kind"],
                name=item["name"].strip(),
                quantity=item["quantity"],
                from_regulation=item["from_regulation"],
                is_cancelled=item["is_cancelled"],
                cancel_reason=(item.get("cancel_reason") or "").strip(),
            )
            for item in items
        ])
        if plan is not None and is_periodic:
            plan.next_planned_date = next_date
            plan.save(update_fields=["next_planned_date"])

    # B44. Уведомление «Выполненное ТО» (admin/accountant, кроме исполнителя).
    from accounts.models import NotificationKind
    from accounts.notifications import notify_maintenance

    notify_maintenance(
        instance, NotificationKind.MAINTENANCE_PERFORMED,
        date=timezone.localdate(), exclude_user=actor,
        regulation_name=record.regulation_name,
    )
    return record
