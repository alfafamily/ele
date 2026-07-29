"""B44. Диспетчер уведомлений: доступность видов по ролям, вычисление
получателей ТО-событий и доставка по каналам (почта + Web Push).

Хелперы доступности (eligible_kinds / domains_for / can_configure_types /
type_in_scope) — единый источник правды и для рассылки, и для API раздела
«Уведомления» (какие строки/блоки показывать пользователю).
"""
from django.conf import settings

from .models import NotificationKind, NotificationPreference, User
from .push import send_to_user

Role = User.Role
Kind = NotificationKind

MAINTENANCE_KINDS = (Kind.MAINTENANCE_DUE, Kind.MAINTENANCE_OVERDUE, Kind.MAINTENANCE_PERFORMED)


# ─── доступность видов/доменов по роли ──────────────────────────────────────

def eq_maintainer(user) -> bool:
    """Пользователь получает ТО-события по оборудованию (подходит/просрочено)."""
    return (
        user.role == Role.ADMIN
        or user.role == Role.MAINTENANCE
        or (user.role == Role.ACCOUNTANT and user.can_maintain)
    )


def tr_maintainer(user) -> bool:
    """Пользователь получает ТО-события по транспорту (подходит/просрочено)."""
    return (
        user.role == Role.ADMIN
        or user.role == Role.AUTOMECHANIC
        or (user.role == Role.ACCOUNTANT and user.can_maintain_transport)
    )


def eligible_kinds(user) -> set:
    """Виды уведомлений, доступные пользователю (для рассылки и для UI)."""
    kinds = {Kind.ASSIGNMENT_PENDING}  # доступно всем ролям
    if eq_maintainer(user) or tr_maintainer(user):
        kinds |= {Kind.MAINTENANCE_DUE, Kind.MAINTENANCE_OVERDUE}
    if user.role in (Role.ADMIN, Role.ACCOUNTANT):
        kinds.add(Kind.MAINTENANCE_PERFORMED)
    return kinds


def domains_for(user, kind) -> set:
    """Домены ({'equipment','transport'}), к которым применим вид для юзера.
    Для подходит/просрочено — по роли/флагам; для выполненного (admin/
    accountant) — оба; для закрепления — пусто (область типов не применяется)."""
    if kind in (Kind.MAINTENANCE_DUE, Kind.MAINTENANCE_OVERDUE):
        ds = set()
        if eq_maintainer(user):
            ds.add("equipment")
        if tr_maintainer(user):
            ds.add("transport")
        return ds
    if kind == Kind.MAINTENANCE_PERFORMED and user.role in (Role.ADMIN, Role.ACCOUNTANT):
        return {"equipment", "transport"}
    return set()


def can_configure_types(user, kind) -> bool:
    """Настраивают область типов (кнопка «Получать по N типам») только admin и
    accountant и только для ТО-видов; механикам область берётся из их прав ТО."""
    return kind in MAINTENANCE_KINDS and user.role in (Role.ADMIN, Role.ACCOUNTANT)


def _assigned_scope_contains(user, domain, type_id) -> bool:
    """Назначенная пользователю область ТО (та же, что для проведения ТО)."""
    if domain == "equipment":
        return user.maintenance_all_types or user.maintenance_types.filter(id=type_id).exists()
    return user.maintenance_all_transport_types or user.maintenance_transport_types.filter(id=type_id).exists()


def _pref_scope_contains(pref, domain, type_id) -> bool:
    """Сужение области через настройку раздела (дефолт при отсутствии — «все»)."""
    if pref is None:
        return True
    if domain == "equipment":
        return pref.equipment_all_types or pref.equipment_types.filter(id=type_id).exists()
    return pref.transport_all_types or pref.transport_types.filter(id=type_id).exists()


def type_in_scope(user, kind, domain, type_id) -> bool:
    """Попадает ли тип объекта в область уведомлений пользователя.

    - подходит/просрочено: база — назначенная область ТО пользователя (у
      бухгалтера — его maintenance_types; у админа — «все»), которую настройка
      раздела может только сузить;
    - выполнено (admin/accountant): область берётся только из настройки раздела
      (дефолт «все»), без ограничения назначенной областью ТО;
    - механики: строго по своей назначенной области ТО."""
    if user.role in (Role.ADMIN, Role.ACCOUNTANT):
        if kind in (Kind.MAINTENANCE_DUE, Kind.MAINTENANCE_OVERDUE) and not _assigned_scope_contains(user, domain, type_id):
            return False
        return _pref_scope_contains(_pref(user, kind), domain, type_id)
    if domain == "equipment" and user.role == Role.MAINTENANCE:
        return _assigned_scope_contains(user, "equipment", type_id)
    if domain == "transport" and user.role == Role.AUTOMECHANIC:
        return _assigned_scope_contains(user, "transport", type_id)
    return False


def _pref(user, kind):
    return NotificationPreference.objects.filter(user=user, kind=kind).first()


def _channels(pref):
    """(email_on, push_on) с дефолтом «включено» при отсутствии строки."""
    if pref is None:
        return True, True
    return pref.email_enabled, pref.push_enabled


# ─── вычисление получателей ─────────────────────────────────────────────────

def _roles_for(kind, domain):
    if kind == Kind.MAINTENANCE_PERFORMED:
        return [Role.ADMIN, Role.ACCOUNTANT]
    if domain == "equipment":
        return [Role.ADMIN, Role.ACCOUNTANT, Role.MAINTENANCE]
    return [Role.ADMIN, Role.ACCOUNTANT, Role.AUTOMECHANIC]


def recipients_for_maintenance(kind, domain, type_id, exclude_user=None):
    """Список (user, email_on, push_on) для ТО-события конкретного типа."""
    qs = (
        User.objects.filter(is_active=True, role__in=_roles_for(kind, domain))
        .prefetch_related("maintenance_types", "maintenance_transport_types")
    )
    out = []
    for u in qs:
        if kind not in eligible_kinds(u):
            continue
        if domain not in domains_for(u, kind):
            continue
        if exclude_user is not None and u.id == exclude_user.id:
            continue
        if not type_in_scope(u, kind, domain, type_id):
            continue
        email_on, push_on = _channels(_pref(u, kind))
        if email_on or push_on:
            out.append((u, email_on, push_on))
    return out


# ─── доставка ───────────────────────────────────────────────────────────────

_MAINT_EMAIL = {
    Kind.MAINTENANCE_DUE: ("maintenance_due", "maintenance_due.html"),
    Kind.MAINTENANCE_OVERDUE: ("maintenance_overdue", "maintenance_overdue.html"),
    Kind.MAINTENANCE_PERFORMED: ("maintenance_performed", "maintenance_performed.html"),
}
_PUSH_TITLE = {
    Kind.MAINTENANCE_DUE: "Приближается ТО",
    Kind.MAINTENANCE_OVERDUE: "Просрочено ТО",
    Kind.MAINTENANCE_PERFORMED: "Проведено ТО",
}


def _push_body(kind, label, date_str, reg_name):
    reg = f" «{reg_name}»" if reg_name else ""
    if kind == Kind.MAINTENANCE_DUE:
        return f"{label}: приближается плановое ТО{reg}" + (f" ({date_str})." if date_str else ".")
    if kind == Kind.MAINTENANCE_OVERDUE:
        return f"{label}: просрочено плановое ТО{reg}" + (f" (с {date_str})." if date_str else ".")
    # проведено: с названием регламента или «внеплановое», если регламента нет
    body = f"{label}: проведено ТО{reg}" if reg_name else f"{label}: проведено внеплановое ТО"
    return body + (f" {date_str}." if date_str else ".")


def notify_maintenance(obj, kind, *, date=None, exclude_user=None, regulation_name=""):
    """Разослать ТО-уведомление (подходит/просрочено/проведено) по объекту
    (Equipment или Transport) всем подходящим получателям. regulation_name —
    название регламента ТО (для проведённого — из снимка записи; для
    подходит/просрочено — из плана; пусто = внеплановое/без регламента)."""
    from core.assignments import object_label
    from equipment.models import Equipment
    from transport.models import Transport

    if isinstance(obj, Equipment):
        domain, type_id = "equipment", obj.equipment_type_id
    elif isinstance(obj, Transport):
        domain, type_id = "transport", obj.transport_type_id
    else:
        return

    label = object_label(obj)
    inv = getattr(obj, "inventory_number", "")
    full_label = f"{label} (уч. № {inv})" if inv else label
    date_str = date.strftime("%d.%m.%Y") if date else ""
    path = f"/{domain}/{obj.id}"
    cta_url = f"{settings.SITE_URL}{path}"

    email_kind, template = _MAINT_EMAIL[kind]
    push_title = _PUSH_TITLE[kind]
    push_body = _push_body(kind, full_label, date_str, regulation_name)

    for user, email_on, push_on in recipients_for_maintenance(kind, domain, type_id, exclude_user):
        if email_on:
            from .emails import send_maintenance_email

            send_maintenance_email(
                user, kind=email_kind, template=template,
                object_label=full_label, date_str=date_str, cta_url=cta_url,
                regulation_name=regulation_name,
            )
        if push_on:
            send_to_user(user, {
                "title": push_title, "body": push_body, "url": path,
                "tag": f"{kind}:{domain}:{obj.id}",
            })


def notify_assignment_pending(user, assignment):
    """Событие 1: закрепление имущества, требующее акцепта (дублирует письмо 5)."""
    if not user or not user.email:
        return
    from core.assignments import object_label

    try:
        label = object_label(assignment.content_object) if assignment.content_object is not None else "имущество"
    except Exception:
        label = "имущество"

    email_on, push_on = _channels(_pref(user, Kind.ASSIGNMENT_PENDING))
    if email_on:
        from .emails import send_assignment_pending

        send_assignment_pending(user, assignment)
    if push_on:
        send_to_user(user, {
            "title": "Требуется подтверждение получения",
            "body": f"За вами закрепили: {label}. Подтвердите получение в профиле.",
            "url": "/profile",
            "tag": f"assignment:{assignment.id}",
        })
