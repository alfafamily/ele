from .base import *  # noqa: F401,F403
from .base import env

DEBUG = False
ALLOWED_HOSTS = env.list("DJANGO_ALLOWED_HOSTS")
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
    EMAIL_USE_TLS = env.bool("EMAIL_USE_TLS", default=True)
else:
    EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"
