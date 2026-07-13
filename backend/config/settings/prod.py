from .base import *  # noqa: F401,F403
from .base import env

DEBUG = False
# Внутренний healthcheck контейнера (docker-compose.prod.yml) и LB-пробы ходят
# на http://localhost:8000/ с Host: localhost — его нет в DJANGO_ALLOWED_HOSTS
# (там только домен инстанса), поэтому без этих двух имён Django отвечал бы
# 400 DisallowedHost и backend навсегда оставался бы unhealthy. Это loopback-
# адреса внутри контейнера, не публичная поверхность, — на безопасность не
# влияют (снаружи Host подставляет Caddy).
ALLOWED_HOSTS = env.list("DJANGO_ALLOWED_HOSTS") + ["localhost", "127.0.0.1"]
CSRF_TRUSTED_ORIGINS = env.list("CSRF_TRUSTED_ORIGINS")

SECURE_SSL_REDIRECT = False  # TLS terminates at Caddy, not Django
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
# Caddy — единственный reverse-proxy перед Django (backend не публикует порт
# напрямую, docker-compose.prod.yml) и сам проставляет X-Forwarded-Proto —
# без этой настройки request.is_secure() всегда считал бы соединение http.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

# SMTP — опционален, как капча/Яндекс ID (§4.6, §4.3): пусто = приложение не
# падает при старте, письма просто некуда слать (Setup Wizard пропустит
# проверку почты и предупредит, что уведомления не будут доставляться).
EMAIL_HOST = env("EMAIL_HOST", default="")
EMAIL_CONFIGURED = bool(EMAIL_HOST)
if EMAIL_CONFIGURED:
    EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
    EMAIL_PORT = env.int("EMAIL_PORT", default=587)
    EMAIL_HOST_USER = env("EMAIL_HOST_USER", default="")
    EMAIL_HOST_PASSWORD = env("EMAIL_HOST_PASSWORD", default="")
    # Порт 465 — implicit SSL, 587 — STARTTLS. EMAIL_USE_SSL по умолчанию выводим
    # из порта (465 → SSL): инстансы со старым .env (без этой переменной)
    # заработают на 465 после обычного обновления, без ручной правки. Явный
    # EMAIL_USE_SSL в .env перекрывает автоопределение. Django запрещает оба
    # флага сразу, поэтому SSL принудительно выключает TLS (иначе старт упал бы).
    EMAIL_USE_SSL = env.bool("EMAIL_USE_SSL", default=(EMAIL_PORT == 465))
    EMAIL_USE_TLS = False if EMAIL_USE_SSL else env.bool("EMAIL_USE_TLS", default=True)
    # Без таймаута сокет к недоступному SMTP висит минутами и вешает весь
    # запрос (напр. отправку приглашения) — 10 с дают быстрый понятный отказ.
    EMAIL_TIMEOUT = env.int("EMAIL_TIMEOUT", default=10)
else:
    EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"
