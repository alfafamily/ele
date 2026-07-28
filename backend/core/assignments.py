"""B32. Общая логика эпизодов закрепления объекта за сотрудником (акцепт выдачи).

Единая точка для всех разделов (Оборудование/SIM/Пропуск/Инструмент). Модель —
employees.EmployeeAssignment. Импорты моделей — лениво, чтобы не плодить циклы.

Жизненный цикл эпизода:
  • create_assignment(obj, employee, ...) — при закреплении за сотрудником;
    статус pending (у сотрудника есть пользователь) или in_absentia (нет);
  • accept/reject — решение самого сотрудника-пользователя; reject возвращает
    объект на прежнее место и закрывает эпизод;
  • close_open_assignment(obj) — при откреплении/переназначении/списании/увольнении
    (эпизод закрывается, статус акцепта сохраняется как был);
  • relink_in_absentia(employee) — при увязке пользователя к сотруднику: заочные
    эпизоды становятся pending.

Рабочие места эпизодов не создают (оборудование за местом, не за сотрудником).
"""

from django.utils import timezone


# ——— определение вида/подписи объекта ————————————————————————————————————————

def object_kind_of(obj):
    from employees.models import AccessPass, EmployeeAssignment, SimCard
    from equipment.models import Equipment
    from tools.models import Tool
    from transport.models import Transport

    if isinstance(obj, Equipment):
        return EmployeeAssignment.ObjectKind.EQUIPMENT
    if isinstance(obj, SimCard):
        return EmployeeAssignment.ObjectKind.SIM
    if isinstance(obj, AccessPass):
        return EmployeeAssignment.ObjectKind.PASS
    if isinstance(obj, Tool):
        return EmployeeAssignment.ObjectKind.TOOL
    if isinstance(obj, Transport):
        return EmployeeAssignment.ObjectKind.TRANSPORT
    raise TypeError(f"Объект {obj!r} не поддерживает закрепление за сотрудником")


def object_label(obj):
    """Как объект выводится на странице своего списка (для текстов истории/отказа)."""
    from employees.models import AccessPass, SimCard
    from equipment.models import Equipment
    from tools.models import Tool
    from transport.models import Transport

    if isinstance(obj, Transport):
        model_value = next(
            (fv.value_text for fv in obj.field_values.all()
             if fv.field.is_locked and fv.field.name == "Модель" and fv.value_text),
            None,
        )
        base = obj.transport_type.name if obj.transport_type_id else "Транспорт"
        return f"{base} {model_value}".strip() if model_value else base
    if isinstance(obj, Equipment):
        model_value = next(
            (fv.value_text for fv in obj.field_values.all()
             if fv.field.is_locked and fv.field.name == "Модель" and fv.value_text),
            None,
        )
        base = obj.equipment_type.name if obj.equipment_type_id else "Оборудование"
        return f"{base} {model_value}".strip() if model_value else base
    if isinstance(obj, SimCard):
        return obj.phone_number
    if isinstance(obj, AccessPass):
        if obj.account_number:
            return obj.account_number
        return f"Ключ #{obj.pk}" if obj.object_type == AccessPass.ObjectType.KEY else f"Пропуск #{obj.pk}"
    if isinstance(obj, Tool):
        return obj.name
    return str(obj)


def subsection_text(a):
    """Текст статуса для контрольного подраздела (= метка Status)."""
    return a.get_status_display()


def movement_texts(a):
    """Строки статуса акцепта для истории движений (подшиваются к закреплению).
    Каждая строка — {text, tone}; tone задаёт иконку на фронте (accepted —
    зелёная галочка, rejected — красный крестик, pending/absentia — нейтрально).
    Для «заочно → появился юзер» строк две."""
    from employees.models import EmployeeAssignment

    S = EmployeeAssignment.Status
    absentia = {"text": "Заочно закреплено за сотрудником", "tone": "absentia"}
    if a.status == S.IN_ABSENTIA:
        return [absentia]
    if a.status == S.PENDING:
        base = [absentia] if a.was_in_absentia else []
        return base + [{"text": "Ожидание подтверждения от сотрудника", "tone": "pending"}]
    if a.status == S.ACCEPTED:
        return [{"text": "Сотрудник подтвердил закрепление", "tone": "accepted"}]
    if a.status == S.REJECTED:
        label = object_label(a.content_object) if a.content_object is not None else f"объект #{a.object_id}"
        text = f"Сотрудник отклонил закрепление, {label} возвращено на {place_label(a.return_place)}"
        if a.decision_comment:
            text += f". Причина: {a.decision_comment}"
        return [{"text": text, "tone": "rejected"}]
    if a.status == S.CANCELLED:
        return [{"text": "Передача отменена ответственным", "tone": "cancelled"}]
    return []


def annotate_acceptance(qs, model):
    """Аннотировать queryset статусом акцепта текущего открытого эпизода
    (для плашек «Закреплено за …» в списках, без N+1). Поле — acceptance_status."""
    from django.db.models import OuterRef, Subquery

    from employees.models import EmployeeAssignment

    from django.contrib.contenttypes.models import ContentType

    ct = ContentType.objects.get_for_model(model)
    sub = (
        EmployeeAssignment.objects.filter(
            content_type=ct, object_id=OuterRef("pk"), closed_at__isnull=True
        )
        .order_by("assigned_at")
        .values("status")[:1]
    )
    return qs.annotate(acceptance_status=Subquery(sub))


def acceptance_annotator(obj):
    """Колбэк для core.history.build_history_rows: по движению закрепления за
    сотрудником вернуть строки статуса акцепта соответствующего эпизода (матч по
    сотруднику + ближайшая дата закрепления). Для field != 'employee' — None."""
    from employees.models import EmployeeAssignment

    episodes = list(
        EmployeeAssignment.objects.filter(content_type=_ct_for(obj), object_id=obj.pk)
    )

    def _for(field, new_id, date):
        if field != "employee" or not new_id:
            return None
        cand = [e for e in episodes if e.employee_id == int(new_id)]
        if not cand:
            return None
        best = min(cand, key=lambda e: abs((e.assigned_at - date).total_seconds()))
        return movement_texts(best)

    return _for


def place_label(place):
    """«Место хранения «…» (Здание — Помещение)» / «Рабочее место «…» (…)» /
    «Без склада» — для текста возврата при отказе."""
    from locations.models import Place

    if place is None:
        return "склад (без склада)"
    kind = "Рабочее место" if place.place_type == Place.PlaceType.WORKPLACE else "Место хранения"
    try:
        loc = f" ({place.room.building.name} — {place.room.name})"
    except Exception:
        loc = ""
    return f"{kind} «{place.name}»{loc}"


# ——— выборки —————————————————————————————————————————————————————————————————

def _ct_for(obj):
    from django.contrib.contenttypes.models import ContentType

    return ContentType.objects.get_for_model(type(obj))


def open_assignments(obj):
    """Открытые эпизоды объекта (для инструмента их может быть несколько)."""
    from employees.models import EmployeeAssignment

    return EmployeeAssignment.objects.filter(
        content_type=_ct_for(obj), object_id=obj.pk, closed_at__isnull=True
    )


def open_assignment(obj):
    """Единственный открытый эпизод (оборуд./SIM/пропуск). Для инструмента —
    первый; используйте open_assignments для полного набора."""
    return open_assignments(obj).order_by("assigned_at", "id").first()


# ——— создание / закрытие ——————————————————————————————————————————————————————

def _initial_status(employee):
    from employees.models import EmployeeAssignment

    has_user = hasattr(employee, "user")
    return EmployeeAssignment.Status.PENDING if has_user else EmployeeAssignment.Status.IN_ABSENTIA


def create_assignment(obj, employee, by_user, *, return_place=None, return_quantity=None,
                      assigned_at=None, notify=True, close_prior=True):
    """Создать эпизод закрепления объекта за сотрудником.

    return_place/return_quantity — куда/сколько вернуть при отказе (снимок прежнего
    размещения). notify=False подавляет письмо (миграция/массовые операции).
    close_prior=True закрывает прежний открытый эпизод объекта (поштучные объекты —
    один эпизод; для инструмента передавать False, т.к. эпизодов может быть много)."""
    from employees.models import EmployeeAssignment

    if close_prior:
        close_open_assignment(obj)
    status = _initial_status(employee)
    a = EmployeeAssignment.objects.create(
        content_type=_ct_for(obj), object_id=obj.pk, object_kind=object_kind_of(obj),
        employee=employee, status=status,
        assigned_by=by_user if getattr(by_user, "is_authenticated", False) else None,
        assigned_at=assigned_at or timezone.now(),
        return_place=return_place, return_quantity=return_quantity,
    )
    if notify and status == EmployeeAssignment.Status.PENDING:
        _notify_pending(a)
    return a


def _close_queryset(qs, when):
    """Закрыть эпизоды (открепление/переназначение/списание ответственным).
    Недорешённые (ожидание/заочно) → «Передача отменена ответственным» — решение
    сотрудника больше не требуется. Принятые/отклонённые статус сохраняют."""
    from employees.models import EmployeeAssignment

    S = EmployeeAssignment.Status
    when = when or timezone.now()
    qs.filter(closed_at__isnull=True, status__in=[S.PENDING, S.IN_ABSENTIA]).update(
        status=S.CANCELLED, closed_at=when
    )
    qs.filter(closed_at__isnull=True).update(closed_at=when)


def close_open_assignment(obj, *, when=None):
    """Закрыть открытые эпизоды объекта (открепление/переназначение/списание/
    утилизация). Для поштучных объектов — единственный; для инструмента — все."""
    _close_queryset(open_assignments(obj), when)


def close_tool_episodes(tool, employee, qty, *, when=None):
    """Инструмент: закрыть открытые эпизоды (tool, employee), покрывая возвращаемое
    количество (старые эпизоды первыми). qty=None — закрыть все (увольнение)."""
    from employees.models import EmployeeAssignment

    S = EmployeeAssignment.Status
    eps = list(
        EmployeeAssignment.objects.filter(
            content_type=_ct_for(tool), object_id=tool.pk, employee=employee,
            closed_at__isnull=True,
        ).order_by("assigned_at", "id")
    )
    when = when or timezone.now()
    remaining = qty
    for ep in eps:
        if remaining is not None and remaining <= 0:
            break
        ep.closed_at = when
        if ep.status in (S.PENDING, S.IN_ABSENTIA):
            ep.status = S.CANCELLED
            ep.save(update_fields=["status", "closed_at"])
        else:
            ep.save(update_fields=["closed_at"])
        if remaining is not None:
            remaining -= (ep.return_quantity or 0)


# ——— решение сотрудника ———————————————————————————————————————————————————————

def _decision_comment(request):
    return (request.data.get("comment") or "").strip() if isinstance(getattr(request, "data", None), dict) else ""


def accept_assignment(a, request):
    from employees.models import EmployeeAssignment

    a.status = EmployeeAssignment.Status.ACCEPTED
    a.decided_by = request.user
    a.decided_at = timezone.now()
    a.decision_comment = _decision_comment(request)
    a.device_snapshot = capture_device_snapshot(request)
    a.save(update_fields=["status", "decided_by", "decided_at", "decision_comment", "device_snapshot"])
    return a


def reject_assignment(a, request):
    """Отклонение: возврат объекта на прежнее место + закрытие эпизода."""
    from employees.models import EmployeeAssignment

    a.status = EmployeeAssignment.Status.REJECTED
    a.decided_by = request.user
    a.decided_at = timezone.now()
    a.decision_comment = _decision_comment(request)
    a.device_snapshot = capture_device_snapshot(request)
    a.closed_at = timezone.now()
    a.save(update_fields=["status", "decided_by", "decided_at", "decision_comment", "device_snapshot", "closed_at"])
    _rollback_object(a, request)
    return a


def _rollback_object(a, request):
    """Вернуть объект на return_place (для инструмента — return_quantity единиц)."""
    from employees.models import AccessPass, EmployeeAssignment, SimCard
    from equipment.models import Equipment
    from tools.models import Tool, ToolAllocation, ToolMovement
    from transport.models import Transport

    from core.history import REJECT_ROLLBACK_REASON

    obj = a.content_object
    if obj is None:
        return
    # Возврат объекта на прежнее место ПИШЕМ в историю (иначе рвётся цепочка diff
    # simple-history и повторное закрепление того же объекта за тем же сотрудником
    # не даёт нового движения), но помечаем служебной причиной REJECT_ROLLBACK_REASON
    # — build_history_rows такую запись НЕ показывает. Факт отказа и возврата уже
    # виден в строке статуса записи закрепления.
    if isinstance(obj, Equipment):
        obj.employee = None
        obj.place = a.return_place
        obj._change_reason = REJECT_ROLLBACK_REASON
        obj.save(update_fields=["employee", "place"])
    elif isinstance(obj, Transport):
        # У транспорта нет складов — отказ просто открепляет.
        obj.employee = None
        obj._change_reason = REJECT_ROLLBACK_REASON
        obj.save(update_fields=["employee"])
    elif isinstance(obj, SimCard):
        obj.employee = None
        obj.storage_place = a.return_place
        obj._change_reason = REJECT_ROLLBACK_REASON
        obj.save(update_fields=["employee", "storage_place"])
    elif isinstance(obj, AccessPass):
        obj.employee = None
        obj.storage_place = a.return_place
        obj._change_reason = REJECT_ROLLBACK_REASON
        obj.save(update_fields=["employee", "storage_place"])
    elif isinstance(obj, Tool):
        qty = a.return_quantity or 0
        if qty <= 0:
            return
        alloc = obj.allocations.filter(employee=a.employee).first()
        if alloc:
            take = min(qty, alloc.quantity)
            alloc.quantity -= take
            if alloc.quantity == 0:
                alloc.delete()
            else:
                alloc.save(update_fields=["quantity"])
        if a.return_place is not None:
            dest, _ = ToolAllocation.objects.get_or_create(
                tool=obj, employee=None, place=a.return_place, defaults={"quantity": 0}
            )
            dest.quantity += qty
            dest.save(update_fields=["quantity"])
        # Для инструмента журнал ToolMovement нужен для целостности баланса
        # (реконструкция «Выдано/Архив» по движениям). Возврат-движение
        # привязываем к тому же эпизоду закрепления (assignment=a) — в истории
        # оно не показывается отдельной строкой, факт отказа виден в записи ASSIGN.
        ToolMovement.objects.create(
            tool=obj, kind=ToolMovement.Kind.UNASSIGN, quantity=qty,
            employee=a.employee, storage_place=a.return_place,
            comment="Отклонено сотрудником", assignment=a,
            created_by=request.user if getattr(request.user, "is_authenticated", False) else None,
        )


# ——— увязка пользователя ——————————————————————————————————————————————————————

def relink_in_absentia(employee):
    """При увязке пользователя к сотруднику: заочные открытые эпизоды → pending
    (was_in_absentia=True). Без писем."""
    from employees.models import EmployeeAssignment

    if employee is None or not hasattr(employee, "user"):
        return
    EmployeeAssignment.objects.filter(
        employee=employee, closed_at__isnull=True,
        status=EmployeeAssignment.Status.IN_ABSENTIA,
    ).update(status=EmployeeAssignment.Status.PENDING, was_in_absentia=True)


def has_open_assignments(employee):
    from employees.models import EmployeeAssignment

    return EmployeeAssignment.objects.filter(employee=employee, closed_at__isnull=True).exists()


def close_employee_assignments(employee, *, when=None):
    """Закрыть все открытые эпизоды сотрудника (увольнение — снимаются все объекты).
    Недорешённые → «Передача отменена ответственным»."""
    from employees.models import EmployeeAssignment

    _close_queryset(EmployeeAssignment.objects.filter(employee=employee, closed_at__isnull=True), when)


# ——— слепок устройства ————————————————————————————————————————————————————————

def device_snapshot_enabled():
    from company.models import Company

    c = Company.objects.first()
    return bool(c and c.device_snapshot_enabled)


def capture_device_snapshot(request):
    """Слепок устройства при решении — только если включён флаг компании. Сервер:
    IP + разбор User-Agent; клиент присылает tz/screen/ua_hints в теле запроса."""
    if not device_snapshot_enabled():
        return None
    from core.useragent import parse_user_agent
    from core.utils.client_ip import get_client_ip

    ua = request.META.get("HTTP_USER_AGENT", "")
    snap = {"ip": get_client_ip(request), "user_agent": ua, **parse_user_agent(ua)}
    data = getattr(request, "data", {}) or {}
    client = data.get("device") if isinstance(data, dict) else None
    if isinstance(client, dict):
        # Доверенные клиентские поля (не переопределяют серверные ip/ua).
        for key in ("timezone", "screen", "language", "platform", "model", "os_version"):
            val = client.get(key)
            if val:
                snap[key] = str(val)[:200]
    return snap


# ——— уведомление ——————————————————————————————————————————————————————————————

def _notify_pending(a):
    """Письмо сотруднику-пользователю о новой выдаче, требующей подтверждения."""
    try:
        user = a.employee.user
    except Exception:
        return
    if not user or not user.email:
        return
    from accounts.emails import send_assignment_pending

    send_assignment_pending(user, a)
