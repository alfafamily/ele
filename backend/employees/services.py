"""Сервисный слой приложения employees (B53-R2).

Транзакционные сценарии приложения, вынесенные из HTTP-слоя (@action вьюсетов):
во вью остаётся разбор запроса и сериализация ответа, а атомарная бизнес-логика
живёт здесь. Поведение идентично прежнему коду во вью.
"""

import logging

from django.db import transaction
from django.utils import timezone

logger = logging.getLogger(__name__)


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
    # B51-R1: точка отсчёта авто-обезличивания. Каждое увольнение перезапускает
    # таймер (при восстановлении поле сбрасывается в NULL).
    employee.terminated_at = timezone.now()
    employee.save(update_fields=["is_employed", "terminated_at"])

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


class AnonymizeError(Exception):
    """Обезличивание невозможно в текущем состоянии сотрудника (400)."""


# Маркер обезличенной записи вместо ФИО (см. Employee.__str__ → «last first»).
ANONYMIZED_NAME = "Удалён"


@transaction.atomic
def anonymize_employee(employee, *, actor=None):
    """B51-R1. Необратимо стирает персональные данные субъекта (сотрудник +
    связанный пользователь + слепки устройств), сохраняя ссылочную целостность и
    историю действий. Обходит запрет физического удаления (on_delete=PROTECT у
    EmployeeAssignment.employee и др.): запись остаётся «скелетом» без ПДн.

    Условие: сотрудник должен быть уволен (is_employed=False) — увольнение уже
    сняло всё имущество на склад. Повторное обезличивание — no-op-ошибка.

    Что стирается:
      • Employee: ФИО → «Удалён»; аватар (файл в S3 + StoredFile) удаляется.
        Должность/отдел сохраняются (не ПДн после снятия идентификаторов).
      • User (если есть): email → технический deleted+<id>@anonymized.invalid,
        пароль делается неиспользуемым, is_active=False, Web Push-подписки удаляются.
      • EmployeeAssignment.device_snapshot → NULL во всех эпизодах сотрудника
        (IP/UA/геопризнаки). decision_comment не трогаем (там ПДн практически нет).
    """
    from storage.service import delete_stored_file

    if employee.is_anonymized:
        raise AnonymizeError("Запись уже обезличена.")
    if employee.is_employed:
        raise AnonymizeError("Обезличить можно только уволенного сотрудника.")

    # Аватар — удалить бинарник из хранилища и запись StoredFile.
    # B56-R1 (#9): физическое удаление файла из S3 нельзя делать внутри @atomic —
    # при откате транзакции строка StoredFile восстановится, а бинарник в S3 уже
    # стёрт (висячая ссылка на несуществующий файл). Откладываем на after-commit:
    # если обезличивание откатится, файл останется нетронутым; если пройдёт —
    # чистится после фиксации (в худшем случае безобидный orphan в S3, но не
    # битая ссылка из БД).
    if employee.avatar_id:
        avatar = employee.avatar
        employee.avatar = None
        transaction.on_commit(lambda a=avatar: delete_stored_file(a))

    employee.first_name = ""
    employee.last_name = ANONYMIZED_NAME
    employee.is_anonymized = True
    employee.anonymized_at = timezone.now()
    employee.save(update_fields=[
        "first_name", "last_name", "avatar", "is_anonymized", "anonymized_at",
    ])

    # Слепки устройств — во всех эпизодах сотрудника (EmployeeAssignment не
    # историзуется, поэтому bulk update безопасен и не плодит историю).
    employee.assignments.exclude(device_snapshot__isnull=True).update(device_snapshot=None)

    # B51-R2: слепок устройства в self-согласии — тоже ПДн субъекта (IP/UA);
    # факт и дату согласия сохраняем, персонализирующий слепок стираем.
    employee.consents.exclude(device_snapshot__isnull=True).update(device_snapshot=None)

    if hasattr(employee, "user"):
        user = employee.user
        user.email = f"deleted+{user.id}@anonymized.invalid"
        user.set_unusable_password()
        user.is_active = False
        user.save(update_fields=["email", "password", "is_active"])
        # Web Push-подписки (endpoint = идентификатор устройства) — удаляем.
        user.push_subscriptions.all().delete()


def anonymize_due_employees(now=None):
    """B51-R1 (cron). Обезличивает уволенных, у кого с даты увольнения прошло
    ≥ Company.anonymize_after_months. 0 месяцев — авто-обезличивание выключено.
    Идемпотентно (is_anonymized-записи отфильтрованы). Возвращает число
    обработанных записей."""
    from datetime import timedelta

    from company.models import Company

    from .models import Employee

    company = Company.objects.first()
    months = getattr(company, "anonymize_after_months", 0) or 0
    if months <= 0:
        return 0

    now = now or timezone.now()
    # Пороговая дата: уволен не позднее (now − months·30 сут). Календарная
    # точность до дня не важна — операция и так «через ~N месяцев».
    cutoff = now - timedelta(days=30 * months)
    due = Employee.objects.filter(
        is_employed=False, is_anonymized=False, terminated_at__isnull=False,
        terminated_at__lte=cutoff,
    )
    count = 0
    for employee in due:
        # Каждая запись обезличивается в своей транзакции (@transaction.atomic).
        # Сбой по одной (напр. аватар в недоступном S3) не должен прерывать
        # обработку остальных на этом тике cron — логируем и идём дальше.
        try:
            anonymize_employee(employee)
            count += 1
        except Exception:  # noqa: BLE001 — изоляция одной записи от батча
            logger.exception("Не удалось обезличить запись сотрудника id=%s", employee.id)
    return count
