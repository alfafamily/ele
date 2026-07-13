#!/usr/bin/env bash
# ELE — установка/развёртывание инстанса «одной строкой»:
#
#   curl -fsSL https://raw.githubusercontent.com/alfafamily/ele/main/install.sh | bash
#
# Скрипт: проверит Docker (при отсутствии предложит установить сам) →
# склонирует/обновит репозиторий → если нет .env, интерактивно спросит параметры
# и создаст .env сам (секреты не проходят через приложение — только в .env,
# ТЗ §8.6) → соберёт и поднимет прод-стек.
set -euo pipefail

REPO_URL="${ELE_REPO_URL:-https://github.com/alfafamily/ele.git}"
TARGET_DIR="${ELE_DIR:-/opt/ele}"

info() { printf '\033[1;34m[ELE]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[ELE]\033[0m %s\n' "$*"; }
err()  { printf '\033[1;31m[ELE]\033[0m %s\n' "$*" >&2; }
# Подтверждение [y/N] с чтением из /dev/tty — работает и при 'curl | bash'.
confirm() { printf '%s [y/N]: ' "$1" >/dev/tty; IFS= read -r __a </dev/tty || true; case "${__a:-}" in [yYдД]*) return 0;; *) return 1;; esac; }

# --- 1. Проверки окружения -------------------------------------------------
command -v git >/dev/null 2>&1 || { err "Нужен git."; exit 1; }

# Интерактивный ввод работает и при запуске через 'curl | bash' — читаем с /dev/tty.
if [ ! -e /dev/tty ]; then err "Нет доступа к терминалу (/dev/tty) для ввода параметров. Запустите скрипт из интерактивной оболочки."; exit 1; fi

# Часть шагов (установка Docker, открытие портов файрвола) требует root. Под
# обычным пользователем выполняем их через sudo, если он есть.
SUDO=""
if [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1; then SUDO="sudo"; fi
have_root() { [ "$(id -u)" -eq 0 ] || [ -n "$SUDO" ]; }

# Docker Engine + Compose v2. Если чего-то нет — предлагаем поставить официальным
# скриптом get.docker.com (ставит движок, compose- и buildx-плагины сразу).
if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  warn "Docker Engine / Compose v2 не найдены на сервере."
  if confirm "Установить Docker автоматически (официальный скрипт https://get.docker.com)?"; then
    have_root || { err "Нужны права root для установки Docker: запустите под root или установите sudo."; exit 1; }
    info "Устанавливаю Docker Engine через get.docker.com…"
    curl -fsSL https://get.docker.com | $SUDO sh || { err "Установка Docker не удалась."; exit 1; }
    $SUDO systemctl enable --now docker >/dev/null 2>&1 || true
    command -v docker >/dev/null 2>&1 || { err "Docker не появился после установки."; exit 1; }
    docker compose version >/dev/null 2>&1 || { err "Docker Compose v2 недоступен после установки Docker."; exit 1; }
    info "Docker установлен: $(docker --version)"
  else
    err "Docker обязателен. Установите вручную (https://docs.docker.com/engine/install/) и повторите."
    exit 1
  fi
fi

# --- 2. Клонирование / обновление -----------------------------------------
if [ -d "$TARGET_DIR/.git" ]; then
  info "Репозиторий уже есть в $TARGET_DIR — обновляю."
  git -C "$TARGET_DIR" pull --ff-only
else
  info "Клонирую $REPO_URL → $TARGET_DIR"
  mkdir -p "$TARGET_DIR"
  git clone --depth 1 "$REPO_URL" "$TARGET_DIR"
fi
cd "$TARGET_DIR"

# --- 3. .env ---------------------------------------------------------------
if [ -f .env ]; then
  info ".env уже существует — использую его без изменений."
else
  info "Файл .env не найден. Заполним параметры (Enter — принять значение по умолчанию/пропустить)."

  rand() { openssl rand -base64 "$1" 2>/dev/null | tr -dc 'A-Za-z0-9' | cut -c1-"$2"; }
  ask() { # ask VAR "Вопрос" "по умолчанию"
    local __var="$1" __prompt="$2" __def="${3:-}" __val
    if [ -n "$__def" ]; then printf '%s [%s]: ' "$__prompt" "$__def" >/dev/tty
    else printf '%s: ' "$__prompt" >/dev/tty; fi
    IFS= read -r __val </dev/tty || true
    printf -v "$__var" '%s' "${__val:-$__def}"
  }
  ask_secret() { # ask_secret VAR "Вопрос"
    local __var="$1" __prompt="$2" __val
    printf '%s: ' "$__prompt" >/dev/tty
    IFS= read -rs __val </dev/tty || true
    printf '\n' >/dev/tty
    printf -v "$__var" '%s' "$__val"
  }

  DJANGO_SECRET_KEY="$(rand 64 50)"

  info "— Основное —"
  ask SITE_ADDRESS "Домен инстанса (A-запись должна указывать на этот сервер)" "ele.example.com"
  ask ELE_ADMIN_EMAIL "Email первого администратора" "admin@${SITE_ADDRESS}"
  while :; do
    ask_secret ELE_ADMIN_PASSWORD "Пароль первого администратора (мин. 8 симв., буквы разных регистров, цифра, спецсимвол)"
    [ -n "$ELE_ADMIN_PASSWORD" ] && break || warn "Пароль обязателен."
  done
  ask DEFAULT_FROM_EMAIL "Адрес отправителя писем" "ELE <no-reply@${SITE_ADDRESS}>"
  POSTGRES_PASSWORD="$(rand 32 24)"

  info "— Почта (SMTP) — Enter, чтобы пропустить (письма отправляться не будут) —"
  ask EMAIL_HOST "SMTP-хост" ""
  EMAIL_PORT=""; EMAIL_HOST_USER=""; EMAIL_HOST_PASSWORD=""; EMAIL_USE_TLS="true"
  if [ -n "$EMAIL_HOST" ]; then
    ask EMAIL_PORT "SMTP-порт" "587"
    ask EMAIL_HOST_USER "SMTP-логин" ""
    ask_secret EMAIL_HOST_PASSWORD "SMTP-пароль"
    ask EMAIL_USE_TLS "Использовать TLS (true/false)" "true"
  fi

  info "— Хранилище файлов —"
  ask ELE_STORAGE_MODE "Режим хранилища (local/s3)" "local"
  S3_ENDPOINT=""; S3_BUCKET=""; S3_REGION=""; S3_ACCESS_KEY=""; S3_SECRET_KEY=""
  if [ "$ELE_STORAGE_MODE" = "s3" ]; then
    ask S3_ENDPOINT "S3 endpoint" ""
    ask S3_BUCKET "S3 bucket" ""
    ask S3_REGION "S3 region" ""
    ask S3_ACCESS_KEY "S3 access key" ""
    ask_secret S3_SECRET_KEY "S3 secret key"
  fi

  YANDEX_SMARTCAPTCHA_SITE_KEY=""; YANDEX_SMARTCAPTCHA_SECRET_KEY=""
  YANDEX_ID_CLIENT_ID=""; YANDEX_ID_CLIENT_SECRET=""
  if confirm "Настроить Яндекс SmartCaptcha и/или Яндекс ID сейчас?"; then
    ask YANDEX_SMARTCAPTCHA_SITE_KEY "Яндекс SmartCaptcha Site key" ""
    ask_secret YANDEX_SMARTCAPTCHA_SECRET_KEY "Яндекс SmartCaptcha Secret key"
    ask YANDEX_ID_CLIENT_ID "Яндекс ID Client ID" ""
    ask_secret YANDEX_ID_CLIENT_SECRET "Яндекс ID Client Secret"
  fi

  umask 077
  cat > .env <<EOF
# Сгенерировано install.sh. Секреты хранятся только здесь (ТЗ §8.6).
DJANGO_SECRET_KEY=${DJANGO_SECRET_KEY}
DJANGO_ALLOWED_HOSTS=${SITE_ADDRESS}
CSRF_TRUSTED_ORIGINS=https://${SITE_ADDRESS}
SITE_URL=https://${SITE_ADDRESS}
DEFAULT_FROM_EMAIL=${DEFAULT_FROM_EMAIL}

POSTGRES_USER=ele
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
POSTGRES_DB=ele

SITE_ADDRESS=${SITE_ADDRESS}

EMAIL_HOST=${EMAIL_HOST}
EMAIL_PORT=${EMAIL_PORT}
EMAIL_HOST_USER=${EMAIL_HOST_USER}
EMAIL_HOST_PASSWORD=${EMAIL_HOST_PASSWORD}
EMAIL_USE_TLS=${EMAIL_USE_TLS}

ELE_ADMIN_EMAIL=${ELE_ADMIN_EMAIL}
ELE_ADMIN_PASSWORD=${ELE_ADMIN_PASSWORD}

ELE_STORAGE_MODE=${ELE_STORAGE_MODE}
S3_ENDPOINT=${S3_ENDPOINT}
S3_BUCKET=${S3_BUCKET}
S3_REGION=${S3_REGION}
S3_ACCESS_KEY=${S3_ACCESS_KEY}
S3_SECRET_KEY=${S3_SECRET_KEY}

YANDEX_SMARTCAPTCHA_SITE_KEY=${YANDEX_SMARTCAPTCHA_SITE_KEY}
YANDEX_SMARTCAPTCHA_SECRET_KEY=${YANDEX_SMARTCAPTCHA_SECRET_KEY}
YANDEX_ID_CLIENT_ID=${YANDEX_ID_CLIENT_ID}
YANDEX_ID_CLIENT_SECRET=${YANDEX_ID_CLIENT_SECRET}
EOF
  chmod 600 .env
  info ".env создан в ${TARGET_DIR}/.env (права 600). Изменить значения позже: отредактируйте файл и выполните 'docker compose -f docker-compose.prod.yml up -d'."
fi

# --- 4. Файрвол ------------------------------------------------------------
# ELE слушает 80 (ACME-проверка Let's Encrypt + редирект на HTTPS) и 443
# (HTTPS). Если 443 закрыт, Caddy не получит сертификат и сайт останется без
# TLS. Открываем порты в локальном файрволе ОС (ufw/firewalld).
open_firewall_ports() {
  if command -v ufw >/dev/null 2>&1 && $SUDO ufw status 2>/dev/null | grep -qi "Status: active"; then
    info "Открываю порты 80/443 в ufw…"
    $SUDO ufw allow 80/tcp >/dev/null 2>&1 && $SUDO ufw allow 443/tcp >/dev/null 2>&1 \
      && info "Порты 80/443 открыты в ufw." || warn "Не удалось изменить правила ufw — откройте 80/443 вручную."
  elif command -v firewall-cmd >/dev/null 2>&1 && $SUDO firewall-cmd --state >/dev/null 2>&1; then
    info "Открываю порты 80/443 в firewalld…"
    $SUDO firewall-cmd --permanent --add-service=http --add-service=https >/dev/null 2>&1 \
      && $SUDO firewall-cmd --reload >/dev/null 2>&1 \
      && info "Порты 80/443 открыты в firewalld." || warn "Не удалось изменить правила firewalld — откройте 80/443 вручную."
  else
    info "Активный локальный файрвол (ufw/firewalld) не обнаружен — открывать порты не требуется."
  fi
}
if have_root; then
  open_firewall_ports
else
  warn "Без root не могу открыть порты файрвола — при необходимости откройте 80 и 443 вручную."
fi
# ВАЖНО: если сервер за облачным файрволом/security group (панель провайдера),
# порты 80 и 443 надо открыть ещё и там — это вне сервера, скрипт до них не достанет.
warn "Если провайдер использует внешний файрвол/security group — откройте 80 и 443 в его панели, иначе HTTPS не поднимется."

# --- 5. Сборка и запуск ----------------------------------------------------
# Docker Hub ограничивает анонимные пулы (~100 за 6 ч на IP; на IP хостера за
# NAT лимит легко исчерпан не вами) и отвечает 429 Too Many Requests. Вход в
# аккаунт поднимает лимит и привязывает его к учётке, а не к общему IP.
if confirm "Войти в Docker Hub перед сборкой? (снимает ошибку 429 при скачивании образов)"; then
  docker login </dev/tty || warn "Вход не выполнен — продолжаю анонимно."
fi

info "Сборка и запуск прод-стека (backend, frontend, PostgreSQL, Caddy)…"
# Retry с нарастающей паузой: 429 от Docker Hub обычно транзиентный, поэтому
# не роняем установку с первого раза, а ждём и повторяем.
attempt=1; max_attempts=5
until docker compose -f docker-compose.prod.yml up -d --build; do
  if [ "$attempt" -ge "$max_attempts" ]; then
    err "Не удалось собрать/запустить стек за ${max_attempts} попыток."
    err "Частая причина — лимит Docker Hub (429). Выполните 'docker login' и повторите, либо подождите ~6 ч."
    exit 1
  fi
  wait_s=$((attempt * 30))
  warn "Сборка не удалась (возможно, лимит Docker Hub 429). Повтор через ${wait_s} с… (попытка ${attempt}/${max_attempts})"
  sleep "$wait_s"
  attempt=$((attempt + 1))
done

info "Готово. После получения TLS-сертификата приложение будет доступно по адресу:"
info "  https://$(grep -E '^SITE_ADDRESS=' .env | cut -d= -f2-)"
info "Первый вход — учётной записью администратора из .env (или через Setup Wizard, ТЗ §4.1)."
