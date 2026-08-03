"""B51-R2. Фиксация согласия субъекта на обработку ПДн.

Оператор подтверждает получение согласия (снимок Должность+ФИО), либо сам субъект
выражает согласие в интерфейсе (со слепком устройства — доказательство). Обе
записи могут сосуществовать: согласие субъекта дополняет отметку оператора.
"""

from django.db import transaction

from .models import EmployeeConsent


def _current_document_qs():
    from company.pdn import current_documents

    return [doc for doc in current_documents().values() if doc is not None]


def capture_consent_snapshot(request):
    """Слепок устройства для доказательства согласия — снимается ВСЕГДА (в отличие
    от слепка при акцепте закреплений, который за флагом компании). Сервер: IP +
    разбор User-Agent; доверенные клиентские поля — из тела запроса (device)."""
    from core.useragent import parse_user_agent
    from core.utils.client_ip import get_client_ip

    ua = request.META.get("HTTP_USER_AGENT", "")
    snap = {"ip": get_client_ip(request), "user_agent": ua, **parse_user_agent(ua)}
    data = getattr(request, "data", {}) or {}
    client = data.get("device") if isinstance(data, dict) else None
    if isinstance(client, dict):
        for key in ("timezone", "screen", "language", "platform", "model", "os_version"):
            val = client.get(key)
            if val:
                snap[key] = str(val)[:200]
    return snap


@transaction.atomic
def record_operator_consent(employee, operator_user) -> EmployeeConsent:
    """Оператор подтвердил, что согласие субъекта получено. Снимок Должность+ФИО
    оператора — из связанного с ним сотрудника (может отсутствовать)."""
    op_emp = getattr(operator_user, "employee", None)
    consent, _ = EmployeeConsent.objects.update_or_create(
        employee=employee,
        source=EmployeeConsent.Source.OPERATOR,
        defaults={
            "by_position": (op_emp.position if op_emp else "") or "",
            "by_name": str(op_emp) if op_emp else "",
        },
    )
    consent.documents.set(_current_document_qs())
    return consent


@transaction.atomic
def record_self_consent(employee, request) -> EmployeeConsent:
    """Субъект сам выразил согласие. Всегда прикладываем слепок устройства."""
    consent, _ = EmployeeConsent.objects.update_or_create(
        employee=employee,
        source=EmployeeConsent.Source.SELF,
        defaults={"device_snapshot": capture_consent_snapshot(request)},
    )
    consent.documents.set(_current_document_qs())
    return consent


def needs_self_consent(user) -> bool:
    """Показывать ли пользователю напоминание подтвердить согласие: у него есть
    связанный сотрудник и ещё нет self-подтверждения."""
    employee = getattr(user, "employee", None)
    if employee is None or getattr(employee, "is_anonymized", False):
        return False
    return not employee.consents.filter(source=EmployeeConsent.Source.SELF).exists()
