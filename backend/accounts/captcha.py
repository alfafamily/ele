"""Яндекс SmartCaptcha. Пусто в .env = капча отключена без ошибок —
защита от перебора продолжает работать за счёт лимита попыток и блокировки."""
import logging

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

_VALIDATE_URL = "https://smartcaptcha.yandexcloud.net/validate"


def is_captcha_enabled() -> bool:
    return bool(settings.YANDEX_SMARTCAPTCHA_SITE_KEY and settings.YANDEX_SMARTCAPTCHA_SECRET_KEY)


def verify_captcha(token: str, user_ip: str) -> bool:
    if not is_captcha_enabled():
        return True
    if not token:
        return False
    try:
        response = requests.post(
            _VALIDATE_URL,
            data={"secret": settings.YANDEX_SMARTCAPTCHA_SECRET_KEY, "token": token, "ip": user_ip},
            timeout=5,
        )
        response.raise_for_status()
        return response.json().get("status") == "ok"
    except requests.RequestException:
        logger.exception("Ошибка проверки SmartCaptcha")
        return False
