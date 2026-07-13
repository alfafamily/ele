"""Setup Wizard: базовая проверка доступности внешних интеграций (ТЗ §4.1
шаг 3, расширение — см. changelog v1.3 в docs/SPEC.md).

Полноценно проверить капчу/Яндекс ID с бэкенда нельзя — капча требует
решённый пользователем токен, OAuth — пройденный consent в браузере. Здесь
только сетевая доступность эндпоинта, не валидность ключей."""
import requests

_TIMEOUT = 4


def check_smartcaptcha_reachable() -> bool:
    try:
        # Заведомо невалидные secret/token — интересует не результат
        # валидации, а то, что эндпоинт вообще ответил (не 5xx/таймаут).
        response = requests.post(
            "https://smartcaptcha.yandexcloud.net/validate",
            data={"secret": "check", "token": "check"},
            timeout=_TIMEOUT,
        )
        return response.status_code < 500
    except requests.RequestException:
        return False


def check_yandex_oauth_reachable() -> bool:
    try:
        response = requests.get("https://oauth.yandex.ru/authorize", timeout=_TIMEOUT, allow_redirects=False)
        return response.status_code < 500
    except requests.RequestException:
        return False
