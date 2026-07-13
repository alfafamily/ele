# Установка ELE на сервер

ELE поставляется как self-hosted решение (docker-compose): одна копия обслуживает
одну компанию. Ниже — минимальные требования и развёртывание «одной строкой».

## Требования к серверу

| Ресурс | Минимум | Рекомендуется |
|---|---|---|
| ОС | Ubuntu 24.04 LTS | Ubuntu 24.04 / 26.04 LTS |
| CPU | 2 vCPU | 2–4 vCPU |
| ОЗУ | 2 ГБ | 4 ГБ (сборка фронтенда при деплое требует ~1–2 ГБ) |
| Диск | 20 ГБ SSD | 40 ГБ SSD + запас под файлы и резервные копии |
| ПО | Docker Engine 24+, Docker Compose v2, `git`, `openssl` | то же |

Про диск: помимо ОС и Docker-образов (~2–3 ГБ) место расходуют база PostgreSQL,
загруженные файлы (аватары до 2 МБ, файлы реквизитов до 20 МБ) и резервные копии.
При большом объёме файлов вынесите хранилище в S3 (`ELE_STORAGE_MODE=s3`) — тогда
диск сервера почти не растёт.

Сеть: домен с A-записью на IP сервера, открытые порты **80** и **443** — Caddy
сам получит и продлит TLS-сертификат Let's Encrypt.

## Установка «одной строкой»

```sh
curl -fsSL https://raw.githubusercontent.com/alfafamily/ele/main/install.sh | bash
```

Скрипт:
1. проверит Docker и Docker Compose;
2. склонирует репозиторий в `/opt/ele` (или обновит, если уже есть);
3. если `.env` ещё нет — **интерактивно спросит параметры и создаст `.env` сам**
   (домен, администратор, почта/SMTP, режим хранилища, при желании — Яндекс
   Captcha/ID); `DJANGO_SECRET_KEY` и пароль PostgreSQL генерируются автоматически.
   Секреты хранятся только в `.env` и не вводятся через интерфейс;
4. соберёт и поднимет прод-стек: `docker compose -f docker-compose.prod.yml up -d --build`.

Каталог установки можно переопределить: `ELE_DIR=/srv/ele bash install.sh`.

### Куда кладётся `.env`

В корень установки — `/opt/ele/.env` (права `600`). Чтобы поменять параметры
позже: отредактируйте файл и примените:

```sh
cd /opt/ele
docker compose -f docker-compose.prod.yml up -d
```

Переменные читаются один раз при старте контейнера — после правки `.env`
обязателен перезапуск (`up -d`). Полный список переменных с пояснениями —
в [`.env.example`](../.env.example).

## Установка вручную (эквивалент)

```sh
git clone https://github.com/alfafamily/ele.git /opt/ele
cd /opt/ele
cp .env.example .env      # заполнить SITE_ADDRESS, ELE_ADMIN_*, секреты
docker compose -f docker-compose.prod.yml up -d --build
```

## Первый вход

- Если в `.env` заданы `ELE_ADMIN_EMAIL` / `ELE_ADMIN_PASSWORD` — администратор
  создаётся автоматически при первом старте.
- Иначе при первом заходе в браузере откроется **мастер первичной настройки**:
  создание администратора, реквизиты компании, проверка интеграций из `.env`.

## Обновление версии

```sh
cd /opt/ele
git pull --ff-only
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d --build
```

Схемные изменения БД применяются миграциями автоматически при старте backend.

## Резервное копирование и восстановление

- Копии создаются из интерфейса (**Настройки → Резервное копирование**) —
  вручную или по расписанию. Файл — JSON со всеми объектами (пароли — хэшами)
  плюс ссылки на файлы.
- **Восстановление — только через CLI** (в интерфейсе не предусмотрено), на
  пустой БД / инстансе в режиме обслуживания:

```sh
docker compose -f docker-compose.prod.yml exec backend \
  python manage.py restore_backup /путь/к/backup.json
```

## Диагностика

```sh
docker compose -f docker-compose.prod.yml ps        # статус сервисов
docker compose -f docker-compose.prod.yml logs -f backend
curl -fsS https://<домен>/api/health/               # health-check API
```
