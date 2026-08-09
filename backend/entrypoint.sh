#!/bin/sh
set -e

# Если стартуем под root (штатный случай — образ без USER), приводим владельца
# томов данных к app и сбрасываем привилегии на app для рабочего процесса.
# На новых установках named-volume пуст и наследует владельца каталога образа
# (app) сам; здесь важен апгрейд СУЩЕСТВУЮЩИХ инсталляций, где static/media уже
# принадлежат root, — иначе gunicorn под app потерял бы право писать (collectstatic,
# загрузка файлов, локальные бэкапы). chown идемпотентен и на новых установках
# по сути no-op. Делает кумулятивный апгрейд бесшовным (без ручного chown).
if [ "$(id -u)" = "0" ]; then
    chown -R app:app /app/staticfiles /app/media 2>/dev/null || true
fi

# Страховка B69: если в накате есть миграции, помеченные деструктивными
# (ele_destructive), обновление останавливается до явного подтверждения
# оператором (ELE_CONFIRM_DESTRUCTIVE=1). На чистой установке — no-op.
python manage.py check_destructive_migrations

python manage.py migrate --noinput

if [ "${DJANGO_COLLECTSTATIC:-0}" = "1" ]; then
    python manage.py collectstatic --noinput
fi

# Первого администратора и компанию создаёт Setup Wizard в браузере при первом
# заходе (пока в системе нет ни одного администратора) — отдельного шага
# автосоздания из .env нет.

# Сброс привилегий: сам рабочий процесс (gunicorn) уже под непривилегированным
# app. gosu заменяет процесс (exec), сигналы/PID 1 доходят до gunicorn напрямую.
if [ "$(id -u)" = "0" ]; then
    exec gosu app "$@"
fi
exec "$@"
