"""
Base settings shared by dev.py and prod.py.
Values that differ between environments — or are secrets — come from env
vars only (see .env.example), never hardcoded here.
"""

from pathlib import Path

import environ

BASE_DIR = Path(__file__).resolve().parent.parent.parent

env = environ.Env()
environ.Env.read_env(BASE_DIR / ".env")

SECRET_KEY = env("DJANGO_SECRET_KEY")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "simple_history",
    "core",
    "storage",
    "company",
    "accounts",
    "employees",
    "equipment",
    "tools",
    "licenses",
    "locations",
    "audit",
    "backup",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    # B9: гейт служебной Django-админки (/django_admin) — глобальный флаг + IP.
    # Стоит до CommonMiddleware, чтобы APPEND_SLASH не редиректил `/django_admin`
    # раньше гейта; при закрытом доступе всегда отдаёт 404 (и для пути без слэша).
    "core.middleware.AdminAccessGateMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    # CSP sandbox на /media в dev (в проде — Caddy), защита от stored XSS через
    # загруженные файлы реквизитов.
    "core.middleware.MediaSecurityHeadersMiddleware",
    # Автозаполнение history_user на Historical*-записях из request.user.
    "simple_history.middleware.HistoryRequestMiddleware",
]

# SAMEORIGIN (вместо дефолтного DENY): фронтенд встраивает предпросмотр файлов
# реквизитов (PDF и т.п.) с того же домена в iframe. Внешние сайты по-прежнему
# не могут фреймить приложение — защита от clickjacking сохраняется.
X_FRAME_OPTIONS = "SAMEORIGIN"

AUTH_USER_MODEL = "accounts.User"

# Комментарии к движениям/созданию объектов (Оборудование, Лицензии, SIM,
# Средства доступа) храним в history_change_reason. Делаем его TextField, чтобы
# вместить многострочный комментарий (по умолчанию — CharField на 100 символов).
SIMPLE_HISTORY_HISTORY_CHANGE_REASON_USE_TEXT_FIELD = True

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        # ELE_base_email.html + per-email child templates land under
        # backend/templates/email/ once accounts app ships emails (Фаза 3).
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

# Единственная компания на инстанс — Postgres задаётся
# через env, без мультитенантных схем/роутеров.
DATABASES = {
    "default": env.db("DATABASE_URL", default="postgres://ele:ele@postgres:5432/ele"),
}

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator", "OPTIONS": {"min_length": 8}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
    # Строчные+прописные латинские буквы, цифры, спецсимволы.
    {"NAME": "accounts.validators.ComplexityPasswordValidator"},
]

LANGUAGE_CODE = "ru-ru"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STATICFILES_DIRS = [BASE_DIR / "static"]

MEDIA_URL = "media/"
MEDIA_ROOT = BASE_DIR / "media"

# Явный запас над крупнейшим разрешённым файлом (реквизит типа "файл",
# 20 МБ —) — Django-дефолт 2.5 МБ формально не режет файловые
# части multipart-формы, но лучше не полагаться на этот нюанс парсера.
DATA_UPLOAD_MAX_MEMORY_SIZE = 25 * 1024 * 1024
FILE_UPLOAD_MAX_MEMORY_SIZE = 25 * 1024 * 1024

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Сессионная аутентификация, не JWT — единая инвалидация сессий
# при смене пароля/деактивации (через встроенный get_session_auth_hash() —
# см. комментарий в accounts/views.py). Классы пагинации — Фаза 4.
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.SessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "EXCEPTION_HANDLER": "core.exceptions.exception_handler",
}

# SPA и backend — на одном домене за Caddy, поэтому CORS не нужен.
# Cookie CSRF-токена должна быть читаема из JS фронтенда.
CSRF_COOKIE_HTTPONLY = False

# Публичный адрес инстанса (совпадает и для SPA, и для API — один домен за
# Caddy). Используется для абсолютных ссылок в письмах и OAuth redirect_uri.
SITE_URL = env("SITE_URL", default="http://localhost")

DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", default="ELE <no-reply@ele.local>")

# Таймаут бездействия сессии — 24 часа : SAVE_EVERY_REQUEST
# продлевает cookie при активности, т.е. это именно idle-таймаут, а не
# абсолютный TTL с момента входа.
SESSION_COOKIE_AGE = 60 * 60 * 24
SESSION_SAVE_EVERY_REQUEST = True

# Срок жизни токенов подтверждения email/приглашения/сброса пароля — 24 часа
# (для confirm-email/change-email срок явно не зафиксирован, принят по
# аналогии для единообразия).
PASSWORD_RESET_TIMEOUT = 60 * 60 * 24

# --- Первый администратор из .env (сценарий 1) ---
ELE_ADMIN_EMAIL = env("ELE_ADMIN_EMAIL", default="")
ELE_ADMIN_PASSWORD = env("ELE_ADMIN_PASSWORD", default="")

# Каталог установки на хосте — install.sh пишет его в .env. Нужен только чтобы
# показать точный путь в команде обновления (Настройки → Обновление). Для
# инстансов, поставленных до появления этой записи, — дефолт /opt/ele.
ELE_INSTALL_DIR = env("ELE_DIR", default="/opt/ele")

# --- Яндекс SmartCaptcha — пусто = капча выключена без ошибок ---
YANDEX_SMARTCAPTCHA_SITE_KEY = env("YANDEX_SMARTCAPTCHA_SITE_KEY", default="")
YANDEX_SMARTCAPTCHA_SECRET_KEY = env("YANDEX_SMARTCAPTCHA_SECRET_KEY", default="")

# --- Яндекс ID OAuth — пусто = кнопка входа не отображается ---
YANDEX_ID_CLIENT_ID = env("YANDEX_ID_CLIENT_ID", default="")
YANDEX_ID_CLIENT_SECRET = env("YANDEX_ID_CLIENT_SECRET", default="")

# --- Хранилище файлов (шаг 3) ---
# Backend НЕ пишет в .env — Setup Wizard только
# читает то, что уже задано в окружении контейнера, и тестирует подключение
# (company/views.py EnvironmentStatusView/TestStorageConnectionView).
ELE_STORAGE_MODE = env("ELE_STORAGE_MODE", default="local")
S3_ENDPOINT = env("S3_ENDPOINT", default="")
S3_BUCKET = env("S3_BUCKET", default="")
S3_REGION = env("S3_REGION", default="")
S3_ACCESS_KEY = env("S3_ACCESS_KEY", default="")
S3_SECRET_KEY = env("S3_SECRET_KEY", default="")
