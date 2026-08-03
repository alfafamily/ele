#!/usr/bin/env bash
# Пере-пиннинг базовых Docker-образов по digest во всех файлах проекта.
#
# Образы запинены как `name:tag@sha256:…` (см. Dockerfile'ы и docker-compose*.yml):
# tag читаемый, digest фиксирует неизменяемый образ. При апгрейде тега или для
# подтягивания свежего образа под тем же тегом (security-патчи базового образа)
# запусти этот скрипт — он резолвит текущий index-digest каждого тега из реестра
# и переписывает `@sha256:…` во всех файлах разом.
#
#   ./infra/update-image-digests.sh            # обновить digest'ы под текущие теги
#   ./infra/update-image-digests.sh --check    # только проверить (CI): выйти с 1,
#                                              # если digest в файлах != реестр
#
# Требуется docker (buildx imagetools) и доступ в сеть к реестру. Резолвится
# именно digest манифест-списка (арх-независимый) — один и тот же на amd64/arm64.
set -euo pipefail

cd "$(dirname "$0")/.."

# Файлы, где встречается пиннинг образов.
FILES=(
  backend/Dockerfile
  frontend/Dockerfile
  docker-compose.yml
  docker-compose.prod.yml
)

MODE="update"
[ "${1:-}" = "--check" ] && MODE="check"

# Собираем уникальные пары name:tag (без @sha256) из всех файлов.
mapfile -t REFS < <(
  grep -hoE '([a-z0-9./_-]+):[a-zA-Z0-9._-]+@sha256:[0-9a-f]{64}' "${FILES[@]}" \
    | sed -E 's/@sha256:[0-9a-f]{64}//' | sort -u
)

[ "${#REFS[@]}" -gt 0 ] || { echo "Не найдено запиненных образов в: ${FILES[*]}" >&2; exit 1; }

# Резолв digest'а с ретраями — Docker Hub на анонимных запросах отдаёт
# транзиентные 429/сетевые сбои; одиночная осечка не должна валить весь прогон.
resolve_digest() {
  local ref="$1" d="" i
  for i in 1 2 3; do
    d="$(docker buildx imagetools inspect "$ref" --format '{{.Manifest.Digest}}' 2>/dev/null || true)"
    case "$d" in sha256:*) printf '%s' "$d"; return 0 ;; esac
    sleep "$((i * 3))"
  done
  return 1
}

rc=0
for ref in "${REFS[@]}"; do
  digest="$(resolve_digest "$ref")" || {
    echo "Не удалось получить digest для ${ref} (нет сети / лимит реестра?)" >&2; exit 2; }
  # Экранируем спецсимволы ref для использования в sed.
  esc="$(printf '%s' "$ref" | sed -e 's/[.[\*^$/]/\\&/g')"
  if [ "$MODE" = "check" ]; then
    if grep -qE "${esc}@sha256:[0-9a-f]{64}" "${FILES[@]}" \
       && ! grep -qE "${esc}@${digest}([^0-9a-f]|$)" "${FILES[@]}"; then
      echo "УСТАРЕЛ: ${ref} → актуальный ${digest}"
      rc=1
    fi
  else
    for f in "${FILES[@]}"; do
      sed -i -E "s#${esc}@sha256:[0-9a-f]{64}#${ref}@${digest}#g" "$f"
    done
    echo "OK: ${ref}@${digest}"
  fi
done

if [ "$MODE" = "check" ] && [ "$rc" -ne 0 ]; then
  echo "" >&2
  echo "Digest'ы образов отстали от тегов. Обновите: ./infra/update-image-digests.sh" >&2
fi
exit "$rc"
