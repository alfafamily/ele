# Сторонние компоненты (Third-Party Notices)

Продукт ELE использует стороннее программное обеспечение с открытым исходным
кодом. Настоящий файл перечисляет такие компоненты и их лицензии в порядке
соблюдения условий атрибуции.

**Область.** Перечислены компоненты, попадающие в **поставляемые артефакты
времени выполнения**: runtime-зависимости бэкенда (Python) и prod-зависимости
фронтенда (npm), входящие в собранный бандл.

**Собственный код ELE** распространяется на условиях файла [`LICENSE`](LICENSE)
(проприетарная лицензия) и настоящим файлом не затрагивается.

**Метод и актуальность.** Перечень собран в ходе внутреннего аудита лицензий;
версии соответствуют зафиксированным в `backend/requirements/prod.lock`
(полностью залоченное дерево прод-образа) и `frontend/package-lock.json`.
Полные тексты лицензий и уведомления об авторских правах
поставляются в составе каждого пакета в его репозитории/дистрибутиве (ссылки
на PyPI/npm ниже) и должны сохраняться при перераспространении собранных
артефактов. Ни один компонент не модифицирован.

**Copyleft.** Strong-copyleft (GPL/AGPL) среди зависимостей отсутствует.
Присутствует weak-copyleft (LGPL-3.0 — `psycopg`; MPL-2.0 — `certifi`,
`py-vapid`, `pywebpush`), используемый «как есть», без изменения исходников
самих пакетов (обязательства этих лицензий при этом не возникают в отношении
кода ELE).

---

## Python — runtime бэкенда

Источник: `backend/requirements/prod.lock` (прямые из `base.txt` + транзитивные,
именно этот набор ставится в прод-образ через `--require-hashes`).
Полный текст лицензии — на странице пакета: `https://pypi.org/project/<имя>/`.

| Компонент | Версия | Лицензия |
|---|---|---|
| Django | 6.0.7 | BSD-3-Clause |
| djangorestframework | 3.17.1 | BSD-3-Clause |
| django-environ | 0.14.0 | MIT |
| django-simple-history | 3.12.0 | BSD |
| django-storages | 1.14.6 | BSD |
| psycopg | 3.3.4 | LGPL-3.0-only |
| psycopg-binary | 3.3.4 | LGPL-3.0-only |
| gunicorn | 26.0.0 | MIT |
| pillow | 12.3.0 | MIT-CMU (HPND) |
| requests | 2.34.2 | Apache-2.0 |
| boto3 | 1.43.46 | Apache-2.0 |
| botocore | 1.43.67 | Apache-2.0 |
| s3transfer | 0.19.2 | Apache-2.0 |
| cryptography | 48.0.1 | Apache-2.0 OR BSD-3-Clause |
| pywebpush | 1.14.1 | MPL-2.0 |
| py-vapid | 1.9.4 | MPL-2.0 |
| http-ece | 1.2.1 | MIT |
| certifi | 2026.7.22 | MPL-2.0 |
| cffi | 2.1.1 | MIT-0 |
| charset-normalizer | 3.4.9 | MIT |
| idna | 3.18 | BSD-3-Clause |
| urllib3 | 2.7.0 | MIT |
| pycparser | 3.0 | BSD-3-Clause |
| asgiref | 3.12.1 | BSD-3-Clause |
| sqlparse | 0.5.5 | BSD-3-Clause |
| jmespath | 1.1.0 | MIT |
| python-dateutil | 2.9.0.post0 | Apache-2.0 / BSD-3-Clause |
| six | 1.17.0 | MIT |
| packaging | 26.3 | Apache-2.0 OR BSD-2-Clause |

---

## Node (npm) — prod-зависимости фронтенда

Источник: `frontend/package-lock.json` (записи без флага `dev`).
Полный текст лицензии — на странице пакета: `https://www.npmjs.com/package/<имя>`.

| Компонент | Версия | Лицензия |
|---|---|---|
| react | 19.2.7 | MIT |
| react-dom | 19.2.7 | MIT |
| react-router | 7.18.1 | MIT |
| react-router-dom | 7.18.1 | MIT |
| scheduler | 0.27.0 | MIT |
| cookie | 1.1.1 | MIT |
| set-cookie-parser | 2.7.2 | MIT |
| pdfjs-dist | 4.10.38 | Apache-2.0 |
| @napi-rs/canvas (+ платформенные бинарники) | 0.1.100 | MIT |
