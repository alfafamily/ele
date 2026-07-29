from .base import *  # noqa: F401,F403
from .base import env

DEBUG = True
ALLOWED_HOSTS = ["*"]

# Стенд может стоять за HTTPS-прокси (Caddy, docker-compose.override.yml — домен
# с авто-TLS для Web Push). Тогда Django должен доверять X-Forwarded-Proto, иначе
# видит http и строит абсолютные ссылки (в т.ч. курсор `next` пагинации) по http,
# а на https-странице они блокируются как mixed content — ломается бесконечная
# подгрузка. Как в prod. Без прокси (локальный http) заголовок не приходит —
# request.is_secure() остаётся False, поведение не меняется.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

# Письма в dev — через mailpit (docker-compose), не реальный SMTP; всегда
# "настроено" — mailpit поднимается вместе со стеком без доп. конфигурации.
EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
EMAIL_HOST = env("EMAIL_HOST", default="mailpit")
EMAIL_PORT = env.int("EMAIL_PORT", default=1025)
EMAIL_USE_TLS = False
EMAIL_CONFIGURED = True

CSRF_TRUSTED_ORIGINS = env.list("CSRF_TRUSTED_ORIGINS", default=["http://localhost"])
