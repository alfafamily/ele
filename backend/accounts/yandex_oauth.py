"""Вход/регистрация через Яндекс ID (ТЗ §4.3). Пусто в .env = функциональность
не активна — фронт узнаёт об этом через /api/auth/bootstrap/, ошибки
конфигурации пользователю не показываются."""
import secrets

import requests
from django.conf import settings

_AUTHORIZE_URL = "https://oauth.yandex.ru/authorize"
_TOKEN_URL = "https://oauth.yandex.ru/token"
_USERINFO_URL = "https://login.yandex.ru/info"


def is_yandex_id_enabled() -> bool:
    return bool(settings.YANDEX_ID_CLIENT_ID and settings.YANDEX_ID_CLIENT_SECRET)


def redirect_uri() -> str:
    return f"{settings.SITE_URL}/api/auth/yandex-id/callback/"


def make_state() -> str:
    return secrets.token_urlsafe(24)


def build_authorize_url(state: str) -> str:
    return (
        f"{_AUTHORIZE_URL}?response_type=code"
        f"&client_id={settings.YANDEX_ID_CLIENT_ID}"
        f"&redirect_uri={redirect_uri()}"
        f"&state={state}"
    )


def exchange_code_for_token(code: str) -> str | None:
    response = requests.post(
        _TOKEN_URL,
        data={
            "grant_type": "authorization_code",
            "code": code,
            "client_id": settings.YANDEX_ID_CLIENT_ID,
            "client_secret": settings.YANDEX_ID_CLIENT_SECRET,
        },
        timeout=5,
    )
    if not response.ok:
        return None
    return response.json().get("access_token")


def fetch_user_email(access_token: str) -> str | None:
    response = requests.get(
        _USERINFO_URL,
        params={"format": "json"},
        headers={"Authorization": f"OAuth {access_token}"},
        timeout=5,
    )
    if not response.ok:
        return None
    data = response.json()
    return data.get("default_email") or next(iter(data.get("emails", [])), None)
