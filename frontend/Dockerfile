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
COPY --from=build /app/dist /usr/share/caddy
COPY Caddyfile.static /etc/caddy/Caddyfile
