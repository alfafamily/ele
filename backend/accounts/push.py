"""B44. Отправка Web Push-уведомлений через VAPID (pywebpush).

VAPID-ключи берутся из settings (пусто = push выключен, без ошибок). Протухшие
подписки (404/410 от push-сервиса) удаляются, чтобы не копить мусор и не слать
в никуда. Исключения наружу не пробрасываются — сбой push не должен ронять
бизнес-операцию (закрепление, проведение ТО).
"""
import json
import logging

from django.conf import settings

logger = logging.getLogger(__name__)


def push_configured() -> bool:
    """Push доступен, только когда заданы обе половины VAPID-ключа."""
    return bool(settings.VAPID_PRIVATE_KEY and settings.VAPID_PUBLIC_KEY)


def send_to_subscription(sub, payload: dict) -> bool:
    """Отправить одному устройству. True — принято push-сервисом; False — сбой
    (протухшая подписка удаляется, прочие ошибки логируются)."""
    from pywebpush import WebPushException, webpush

    try:
        webpush(
            subscription_info={
                "endpoint": sub.endpoint,
                "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
            },
            data=json.dumps(payload),
            vapid_private_key=settings.VAPID_PRIVATE_KEY,
            vapid_claims={"sub": settings.VAPID_SUBJECT},
            ttl=60 * 60 * 24,
        )
        return True
    except WebPushException as exc:
        status = getattr(getattr(exc, "response", None), "status_code", None)
        if status in (404, 410):
            # Подписка на стороне push-сервиса больше не существует — удаляем.
            sub.delete()
        else:
            logger.warning("Web push failed (status=%s): %s", status, exc)
        return False
    except Exception as exc:  # сеть/формат — не роняем вызвавшую операцию
        logger.warning("Web push error: %s", exc)
        return False


def send_to_user(user, payload: dict) -> int:
    """Отправить на все устройства пользователя. Возвращает число доставленных."""
    if not push_configured():
        return 0
    delivered = 0
    for sub in list(user.push_subscriptions.all()):
        if send_to_subscription(sub, payload):
            delivered += 1
    return delivered
