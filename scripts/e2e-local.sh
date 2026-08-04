#!/usr/bin/env bash
# B41 — локальный прогон E2E внутри официального Docker-образа Playwright
# (браузеры уже внутри). Цель по умолчанию — живой стек за Caddy на домене.
# Хост-установка Playwright не требуется.
#
#   scripts/e2e-local.sh                    # весь набор (chromium)
#   scripts/e2e-local.sh smoke.spec.js      # конкретный файл
#   PROJECT=mobile scripts/e2e-local.sh     # мобильный проект
set -euo pipefail

WT="$(cd "$(dirname "$0")/.." && pwd)"
IMAGE="${PW_IMAGE:-mcr.microsoft.com/playwright:v1.49.0-jammy}"
BASE_URL="${E2E_BASE_URL:-https://test-ele.dailycompany.cc}"
PROJECT="${PROJECT:-chromium}"

docker run --rm --network host \
  -e E2E_BASE_URL="$BASE_URL" \
  -e CI="${CI:-}" \
  -v "$WT":/work -w /work \
  "$IMAGE" \
  npx playwright test --project="$PROJECT" "$@"
