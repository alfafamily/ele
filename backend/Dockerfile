# Базовый образ запинен по digest (не только по тегу): тег мутабелен, а
# sha256-digest фиксирует конкретный неизменяемый образ — воспроизводимые
# сборки и защита от подмены/переноса тега. Тег рядом оставлен для читаемости и
# автообновления digest'а (Dependabot ecosystem: docker; либо
# infra/update-image-digests.sh). Обновлять digest вместе с апгрейдом тега.
FROM python:3.14-slim@sha256:cea0e6040540fb2b965b6e7fb5ffa00871e632eef63719f0ea54bca189ce14a6

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# gosu — для сброса привилегий в entrypoint: контейнер стартует под root (чтобы
# применить миграции, collectstatic и разово привести владельца named-volume'ов
# static/media к пользователю app), а рабочий процесс gunicorn запускается уже
# под непривилегированным app. Это позволяет кумулятивный апгрейд без ручного
# chown томов у существующих клиентов (тома старых установок принадлежат root).
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends gosu; \
    rm -rf /var/lib/apt/lists/*; \
    gosu nobody true

WORKDIR /app

COPY requirements/ requirements/
ARG REQUIREMENTS_FILE=requirements/prod.txt
RUN pip install --no-cache-dir -r ${REQUIREMENTS_FILE}

COPY . .

# Непривилегированный пользователь (без логина/пароля) и каталоги данных за ним.
# USER здесь НЕ выставляем намеренно: контейнер должен стартовать под root, чтобы
# entrypoint привёл права томов и сбросил привилегии на app сам (см. entrypoint.sh).
RUN groupadd -g 10001 app \
    && useradd -u 10001 -g app -m -d /home/app -s /usr/sbin/nologin app \
    && mkdir -p /app/staticfiles /app/media \
    && chown -R app:app /app

ENTRYPOINT ["./entrypoint.sh"]
CMD ["gunicorn", "config.wsgi:application", "-c", "gunicorn.conf.py"]
