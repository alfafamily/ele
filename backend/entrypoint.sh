#!/bin/sh
set -e

python manage.py migrate --noinput

if [ "${DJANGO_COLLECTSTATIC:-0}" = "1" ]; then
    python manage.py collectstatic --noinput
fi

# Автосоздание первого администратора из .env, если таблица пользователей
# пуста (сценарий 1) — no-op, если ELE_ADMIN_* не заданы.
python manage.py bootstrap_admin

exec "$@"
