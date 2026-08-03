# Прод: собирает статику SPA и сам её раздаёт (Caddy-контейнер этого сервиса,
# отдельный от reverse-proxy Caddy из infra/Caddyfile, который проксирует
# сюда `/`). Один инструмент (Caddy) на весь стек вместо Node+nginx+Caddy.
FROM node:22-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM caddy:2-alpine
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
