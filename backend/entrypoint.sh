#!/bin/sh
set -e

python manage.py migrate --noinput

if [ "${DJANGO_COLLECTSTATIC:-0}" = "1" ]; then
    python manage.py collectstatic --noinput
fi

# Первого администратора и компанию создаёт Setup Wizard в браузере при первом
# заходе (пока в системе нет ни одного администратора) — отдельного шага
# автосоздания из .env нет.

exec "$@"
