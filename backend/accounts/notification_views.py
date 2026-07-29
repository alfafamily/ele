"""B44. API раздела «Уведомления»: Web Push-подписки + настройки каналов.

Push включается отдельно на каждом устройстве (подписка браузера), а настройки
каналов (почта/push по видам) — общие для пользователя. Здесь: выдача публичного
VAPID-ключа, подписка/отписка устройства и чтение/сохранение настроек.
"""
from django.conf import settings
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import NotificationKind, NotificationPreference, PushSubscription
from .notifications import can_configure_types, domains_for, eligible_kinds
from .push import push_configured

# Порядок и подписи строк таблицы «Уведомления» (согласовано B44).
_KIND_ORDER = [
    NotificationKind.ASSIGNMENT_PENDING,
    NotificationKind.ASSIGNMENT_REJECTED,
    NotificationKind.MAINTENANCE_DUE,
    NotificationKind.MAINTENANCE_OVERDUE,
    NotificationKind.MAINTENANCE_PERFORMED,
]
_KIND_LABELS = {
    NotificationKind.ASSIGNMENT_PENDING: "Уведомление о закреплении нового имущества",
    NotificationKind.ASSIGNMENT_REJECTED: "Уведомление об отказе сотрудника от закрепления имущества",
    NotificationKind.MAINTENANCE_DUE: "Уведомление о «подходящем» ТО",
    NotificationKind.MAINTENANCE_OVERDUE: "Уведомление о просроченном (не выполненном) ТО",
    NotificationKind.MAINTENANCE_PERFORMED: "Уведомление о выполненном ТО",
}


class VapidKeyView(APIView):
    """Публичный VAPID-ключ (applicationServerKey) для подписки в браузере."""

    def get(self, request):
        return Response({
            "public_key": settings.VAPID_PUBLIC_KEY,
            "configured": push_configured(),
        })


class PushSubscribeView(APIView):
    """Сохранить push-подписку текущего устройства за пользователем.

    Тело: {endpoint, keys: {p256dh, auth}} — как отдаёт PushManager.subscribe().
    Один endpoint уникален глобально: если он уже был за другим пользователем
    (сменили аккаунт на устройстве) — перепривязываем к текущему.
    """

    def post(self, request):
        data = request.data or {}
        endpoint = (data.get("endpoint") or "").strip()
        keys = data.get("keys") or {}
        p256dh = (keys.get("p256dh") or "").strip()
        auth = (keys.get("auth") or "").strip()
        if not endpoint or not p256dh or not auth:
            return Response({"detail": "Некорректные данные подписки."}, status=400)

        ua = request.META.get("HTTP_USER_AGENT", "")[:300]
        PushSubscription.objects.update_or_create(
            endpoint=endpoint,
            defaults={"user": request.user, "p256dh": p256dh, "auth": auth, "user_agent": ua},
        )
        return Response(status=204)


class PushUnsubscribeView(APIView):
    """Удалить push-подписку устройства (по endpoint) у текущего пользователя."""

    def post(self, request):
        endpoint = ((request.data or {}).get("endpoint") or "").strip()
        if endpoint:
            PushSubscription.objects.filter(user=request.user, endpoint=endpoint).delete()
        return Response(status=204)


def _pref_item(user, kind, pref):
    """Одна строка настроек: каналы + (для настраиваемых видов) область типов."""
    email_on = pref.email_enabled if pref else True
    push_on = pref.push_enabled if pref else True
    item = {
        "kind": kind,
        "label": _KIND_LABELS[kind],
        "email_enabled": email_on,
        "push_enabled": push_on,
        "configurable_types": can_configure_types(user, kind),
        "domains": sorted(domains_for(user, kind)),
    }
    if item["configurable_types"]:
        item["equipment_all_types"] = pref.equipment_all_types if pref else True
        item["transport_all_types"] = pref.transport_all_types if pref else True
        item["equipment_type_ids"] = list(pref.equipment_types.values_list("id", flat=True)) if pref else []
        item["transport_type_ids"] = list(pref.transport_types.values_list("id", flat=True)) if pref else []
    return item


class PreferencesView(APIView):
    """Настройки каналов уведомлений (почта/push) и область типов по видам.

    GET — доступные пользователю виды с текущим состоянием + справочники типов
    (оборудование только с включённым ТО, весь транспорт) для модалки области.
    PATCH — сохранить настройку одного вида (upsert строки NotificationPreference).
    """

    def get(self, request):
        from equipment.models import EquipmentType
        from transport.models import TransportType

        user = request.user
        allowed = eligible_kinds(user)
        prefs = {p.kind: p for p in NotificationPreference.objects.filter(user=user)
                 .prefetch_related("equipment_types", "transport_types")}
        items = [_pref_item(user, k, prefs.get(k)) for k in _KIND_ORDER if k in allowed]

        # Справочники типов для модалки «Получать по N типам» (общие на страницу).
        eq_types = [{"id": t.id, "name": t.name}
                    for t in EquipmentType.objects.filter(maintenance_enabled=True).order_by("name")]
        tr_types = [{"id": t.id, "name": t.name} for t in TransportType.objects.order_by("name")]
        return Response({
            "push_configured": push_configured(),
            "items": items,
            "equipment_types": eq_types,
            "transport_types": tr_types,
        })

    def patch(self, request):
        user = request.user
        data = request.data or {}
        kind = data.get("kind")
        if kind not in eligible_kinds(user):
            return Response({"detail": "Этот вид уведомления вам недоступен."}, status=400)

        pref, _ = NotificationPreference.objects.get_or_create(user=user, kind=kind)
        if "email_enabled" in data:
            pref.email_enabled = bool(data["email_enabled"])
        if "push_enabled" in data:
            pref.push_enabled = bool(data["push_enabled"])

        if can_configure_types(user, kind):
            if "equipment_all_types" in data:
                pref.equipment_all_types = bool(data["equipment_all_types"])
            if "transport_all_types" in data:
                pref.transport_all_types = bool(data["transport_all_types"])
        pref.save()

        if can_configure_types(user, kind):
            if "equipment_type_ids" in data and not pref.equipment_all_types:
                pref.equipment_types.set(_valid_ids(data["equipment_type_ids"], "equipment"))
            elif pref.equipment_all_types:
                pref.equipment_types.clear()
            if "transport_type_ids" in data and not pref.transport_all_types:
                pref.transport_types.set(_valid_ids(data["transport_type_ids"], "transport"))
            elif pref.transport_all_types:
                pref.transport_types.clear()

        pref = (NotificationPreference.objects
                .prefetch_related("equipment_types", "transport_types").get(pk=pref.pk))
        return Response(_pref_item(user, kind, pref))


def _valid_ids(raw, domain):
    """Отфильтровать переданные id по существующим типам домена."""
    try:
        ids = {int(x) for x in (raw or [])}
    except (TypeError, ValueError):
        return []
    if domain == "equipment":
        from equipment.models import EquipmentType
        return list(EquipmentType.objects.filter(id__in=ids).values_list("id", flat=True))
    from transport.models import TransportType
    return list(TransportType.objects.filter(id__in=ids).values_list("id", flat=True))
