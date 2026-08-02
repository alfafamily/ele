"""Сервисный слой приложения employees (B53-R2).

Транзакционные сценарии приложения, вынесенные из HTTP-слоя (@action вьюсетов):
во вью остаётся разбор запроса и сериализация ответа, а атомарная бизнес-логика
живёт здесь. Поведение идентично прежнему коду во вью.
"""

from django.db import transaction


@transaction.atomic
def terminate_employee(employee, request_data, *, actor):
    """Увольнение (E3): по каждому закреплённому объекту (оборудование,
    инструменты, SIM/E-SIM, пропуска/ключи) переносит его на выбранный склад
    назначения; для SIM и пропусков возможна ещё и утилизация / передача
    арендодателю. Сотрудник снимается со всех рабочих мест. Опционально
    деактивирует связанного Пользователя.

    ``request_data`` — тело запроса (dict). ``*_actions`` — словари {id: {...}}.
    Для equipment/tools: {"storage_place"}. Для sim/pass: {"action", "comment",
    "storage_place"}; action: 'detach' (по умолчанию) | 'utilized' | 'handed'
    (только пропуска). storage_place (место хранения) ОБЯЗАТЕЛЕН для перемещаемых
    на хранение объектов; не требуется только для E-SIM и при утилизации/передаче.
    Ключ tool_actions — id инструмента (карточки), а не размещения. Сценарий
    атомарен: если склад где-то не указан — ValidationError (400) без частичного
    увольнения.

    Возвращает словарь сводных счётчиков (для сериализации ответа во вью).
    """
    from django.utils import timezone

    from core.placement import get_storage_place
    from tools.models import ToolAllocation, ToolMovement

    from .models import AccessPass

    # B26: при увольнении каждый перемещаемый объект переезжает на выбранный
    # склад (место хранения) — он обязателен. Ключи словарей — id объекта;
    # значение — {storage_place, action, comment}.
    equipment_actions = request_data.get("equipment_actions") or {}
    tool_actions = request_data.get("tool_actions") or {}
    sim_actions = request_data.get("sim_actions") or {}
    pass_actions = request_data.get("pass_actions") or {}
    reason_map = {c[0] for c in AccessPass.UtilizationReason.choices}

    def req_storage(spec, field):
        """Обязательный склад назначения (400, если не указан/неподходящий)."""
        return get_storage_place((spec or {}).get("storage_place"), field=field)

    # Резолвим все склады ДО мутаций (сценарий ещё и @transaction.atomic) — ошибка
    # «склад не указан» не оставит частично уволенного сотрудника.
    equipment_list = list(employee.equipment.all())
    eq_storage = {
        eq.id: req_storage(equipment_actions.get(str(eq.id)), f"equipment_{eq.id}")
        for eq in equipment_list
    }
    tool_allocations = list(employee.tool_allocations.all())
    tool_storage = {
        a.tool_id: req_storage(tool_actions.get(str(a.tool_id)), f"tool_{a.tool_id}")
        for a in tool_allocations
    }
    active_sims = list(employee.sim_cards.all())
    sim_storage = {}
    for sim in active_sims:
        spec = sim_actions.get(str(sim.id)) or {}
        # Склад нужен только при откреплении обычной SIM: E-SIM виртуальна,
        # утилизируемая карта на склад не переезжает.
        if spec.get("action") != "utilized" and sim.sim_type != "esim":
            sim_storage[sim.id] = req_storage(spec, f"sim_{sim.id}")
    active_passes = list(employee.passes.all())
    pass_storage = {}
    for ap in active_passes:
        spec = pass_actions.get(str(ap.id)) or {}
        # Склад нужен только при откреплении (утилизация/передача — не переезд).
        if spec.get("action") not in reason_map:
            pass_storage[ap.id] = req_storage(spec, f"pass_{ap.id}")

    utilized_sim_count = 0
    utilized_pass_count = 0

    for eq in equipment_list:
        # По одной, не bulk .update() — иначе не сработает история.
        eq.employee = None
        eq.place = eq_storage[eq.id]
        eq.save(update_fields=["employee", "place"])

    # Инструменты возвращаем в свободный остаток на выбранном складе; по
    # каждому — движение «Открепление».
    for alloc in tool_allocations:
        storage = tool_storage[alloc.tool_id]
        dest, _ = ToolAllocation.objects.get_or_create(
            tool=alloc.tool, place=storage, defaults={"quantity": 0}
        )
        dest.quantity += alloc.quantity
        dest.save(update_fields=["quantity"])
        ToolMovement.objects.create(
            tool=alloc.tool,
            kind=ToolMovement.Kind.UNASSIGN,
            quantity=alloc.quantity,
            employee=employee,
            storage_place=storage,
            created_by=actor if actor.is_authenticated else None,
        )
        alloc.delete()

    # SIM-карты — переиспользуемые: открепляем на склад (⇒ «Неиспользуемые»,
    # E-SIM — без склада) или утилизируем. По одной, не bulk — ради истории.
    for sim in active_sims:
        spec = sim_actions.get(str(sim.id)) or {}
        sim.employee = None
        if spec.get("action") == "utilized":
            sim.is_utilized = True
            sim.utilized_at = timezone.now()
            utilized_sim_count += 1
            comment = (spec.get("comment") or "").strip()
            if comment:
                sim._change_reason = comment
            sim.save(update_fields=["employee", "is_utilized", "utilized_at"])
        else:
            sim.storage_place = sim_storage.get(sim.id)  # None только для E-SIM
            sim.save(update_fields=["employee", "storage_place"])

    for ap in active_passes:
        spec = pass_actions.get(str(ap.id)) or {}
        action = spec.get("action")
        ap.employee = None
        if action in reason_map:
            ap.is_utilized = True
            ap.utilized_at = timezone.now()
            ap.utilization_reason = action
            utilized_pass_count += 1
            comment = (spec.get("comment") or "").strip()
            if comment:
                ap._change_reason = comment
            ap.save(update_fields=["employee", "is_utilized", "utilized_at", "utilization_reason"])
        else:
            ap.storage_place = pass_storage[ap.id]
            ap.save(update_fields=["employee", "storage_place"])

    # B26: снимаем сотрудника со всех рабочих мест (M2M) — по одному, чтобы
    # сработала m2m-история Места.
    detached_workplaces = list(employee.workplaces.all())
    for wp in detached_workplaces:
        wp.employees.remove(employee)

    employee.is_employed = False
    employee.save(update_fields=["is_employed"])

    # B32: увольнение сняло все объекты — закрываем все открытые эпизоды акцепта.
    from core.assignments import close_employee_assignments

    close_employee_assignments(employee)

    deactivated_user = False
    if request_data.get("deactivate_user") and hasattr(employee, "user"):
        user = employee.user
        user.is_active = False
        user.save(update_fields=["is_active"])
        deactivated_user = True

    return {
        "detached_equipment_count": len(equipment_list),
        "detached_tool_count": len(tool_allocations),
        "detached_workplace_count": len(detached_workplaces),
        "deactivated_sim_count": len(active_sims) - utilized_sim_count,
        "utilized_sim_count": utilized_sim_count,
        "deactivated_pass_count": len(active_passes) - utilized_pass_count,
        "utilized_pass_count": utilized_pass_count,
        "deactivated_user": deactivated_user,
    }
