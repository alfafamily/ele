# Прод: собирает статику SPA и сам её раздаёт (Caddy-контейнер этого сервиса,
# отдельный от reverse-proxy Caddy из infra/Caddyfile, который проксирует
# сюда `/`). Один инструмент (Caddy) на весь стек вместо Node+nginx+Caddy.
# Базовые образы запинены по digest (см. пояснение в backend/Dockerfile):
# неизменяемая сборка + защита от подмены тега. Тег рядом — для читаемости и
# автообновления (Dependabot docker / infra/update-image-digests.sh).
FROM node:26-slim@sha256:deae974a69e140f44f434ab29cb519fb5f8fe250fd364b8ca446bd0761acdc6a AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM caddy:2-alpine@sha256:5f5c8640aae01df9654968d946d8f1a56c497f1dd5c5cda4cf95ab7c14d58648
# Непривилегированный пользователь для статик-сервера (без root внутри
# контейнера). Право bind на привилегированный :80 даём точечной файловой
# capability на бинаре Caddy, а не запуском под root. /data и /config — рабочие
# каталоги Caddy (XDG), должны быть писабельны новому пользователю.
RUN apk add --no-cache libcap \
    && addgroup -g 10001 caddyapp \
    && adduser -S -u 10001 -G caddyapp caddyapp \
    && setcap 'cap_net_bind_service=+ep' "$(command -v caddy)" \
    && mkdir -p /data /config \
    && chown -R caddyapp:caddyapp /data /config
COPY --from=build /app/dist /usr/share/caddy
COPY Caddyfile.static /etc/caddy/Caddyfile
USER caddyapp
