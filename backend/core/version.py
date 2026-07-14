"""Текущая версия инстанса и проверка последней в публичном репозитории.

Единый источник версии — файл VERSION в корне репозитория; он монтируется в
контейнер как /app/VERSION (см. docker-compose). Последняя версия берётся из
GitHub Releases публичного репозитория; сеть может быть недоступна (локальный
режим), поэтому проверка всегда graceful — при ошибке возвращаем None.
"""
from pathlib import Path

import requests
from django.conf import settings

GITHUB_REPO = "alfafamily/ele"
_LATEST_RELEASE_URL = f"https://api.github.com/repos/{GITHUB_REPO}/releases/latest"
_RELEASES_PAGE = f"https://github.com/{GITHUB_REPO}/releases"


def get_current_version() -> str:
    """Версия инстанса из файла VERSION. 'unknown', если файл недоступен."""
    try:
        return (Path(settings.BASE_DIR) / "VERSION").read_text(encoding="utf-8").strip() or "unknown"
    except OSError:
        return "unknown"


def _parse(v: str) -> tuple:
    """'v1.2.3' / '1.2.3' -> (1, 2, 3); нечисловые части игнорируем."""
    v = v.strip().lstrip("vV")
    parts = []
    for chunk in v.split("."):
        num = "".join(c for c in chunk if c.isdigit())
        parts.append(int(num) if num else 0)
    return tuple(parts)


def is_newer(latest: str, current: str) -> bool:
    return _parse(latest) > _parse(current)


def get_latest_release(timeout: float = 4.0) -> dict | None:
    """Последний релиз из GitHub: {version, url, notes} или None при ошибке/сети."""
    try:
        resp = requests.get(
            _LATEST_RELEASE_URL,
            headers={"Accept": "application/vnd.github+json"},
            timeout=timeout,
        )
        resp.raise_for_status()
        data = resp.json()
        tag = (data.get("tag_name") or "").strip()
        if not tag:
            return None
        return {
            "version": tag.lstrip("vV"),
            "url": data.get("html_url") or _RELEASES_PAGE,
            "notes": (data.get("body") or "").strip(),
        }
    except (requests.RequestException, ValueError):
        return None
