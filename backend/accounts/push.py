"""B44. Отправка Web Push-уведомлений через VAPID (pywebpush).

VAPID-ключи берутся из settings (.env). Пусто = push выключен без ошибок (письма
продолжают работать, кнопка включения push на устройстве недоступна). Протухшие
подписки (404/410 от push-сервиса) удаляются. Исключения наружу не пробрасываются
— сбой push не должен ронять бизнес-операцию (закрепление, проведение ТО).
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
            # Не логируем текст исключения: он может содержать endpoint подписки
            # (URL push-сервиса однозначно идентифицирует устройство/браузер
            # пользователя — это ПДн). Достаточно статуса и класса ошибки.
            logger.warning("Web push failed (status=%s, %s)", status, type(exc).__name__)
        return False
    except Exception as exc:  # сеть/формат — не роняем вызвавшую операцию
        # Сетевые исключения включают URL endpoint'а в тексте — логируем только
        # класс ошибки, без ПДн.
        logger.warning("Web push error: %s", type(exc).__name__)
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
