#!/usr/bin/env python3
"""Гейт лицензий Python-зависимостей (B52 — контроль copyleft).

Проходит по установленным дистрибутивам текущего окружения и завершается с
ошибкой (exit 1), если встречает strong-copyleft (GPL / AGPL / SSPL).

LGPL разрешён явно: драйвер PostgreSQL ``psycopg`` под LGPL-3.0 используется как
библиотека через Python-import (динамическое связывание), copyleft на наш код не
распространяется при использовании как библиотеки. Пакеты без данных о лицензии
выводятся как предупреждение, но сборку не роняют (у известных пакетов метаданные
всегда есть; жёсткий фейл по UNKNOWN дал бы ложные срабатывания на PyPI).

Без внешних зависимостей — только стандартный importlib.metadata.
"""

from __future__ import annotations

import sys
from importlib import metadata


def license_text(dist: metadata.Distribution) -> str:
    """Собирает все сведения о лицензии дистрибутива в одну строку."""
    meta = dist.metadata
    parts: list[str] = []
    for key in ("License-Expression", "License"):
        val = meta.get(key)
        if val and val != "UNKNOWN":
            parts.append(val)
    parts += [c for c in meta.get_all("Classifier", []) if c.startswith("License")]
    return " | ".join(parts)


def forbidden(text: str) -> str | None:
    """Вид запрещённой лицензии или None. LGPL/Lesser считаем разрешённым."""
    t = text.upper()
    if "AGPL" in t or "AFFERO" in t:
        return "AGPL"
    lesser = "LGPL" in t or "LESSER GENERAL PUBLIC" in t
    if not lesser and ("GPL" in t or "GENERAL PUBLIC LICENSE" in t):
        return "GPL"
    if "SSPL" in t or "SERVER SIDE PUBLIC" in t:
        return "SSPL"
    return None


def main() -> int:
    violations: list[tuple[str, str, str, str]] = []
    unknown: list[tuple[str, str]] = []
    seen: set[str] = set()

    for dist in metadata.distributions():
        name = dist.metadata.get("Name", "?")
        if name in seen:
            continue
        seen.add(name)
        text = license_text(dist)
        bad = forbidden(text)
        if bad:
            violations.append((name, dist.version, bad, text))
        elif not text.strip():
            unknown.append((name, dist.version))

    if unknown:
        print("⚠ пакеты без указанной лицензии (UNKNOWN):", file=sys.stderr)
        for pkg, ver in sorted(unknown):
            print(f"  - {pkg}=={ver}", file=sys.stderr)

    if violations:
        print("\n✖ Гейт лицензий Python: обнаружен запрещённый copyleft", file=sys.stderr)
        for pkg, ver, kind, text in violations:
            print(f"  - {pkg}=={ver}: [{kind}] {text}", file=sys.stderr)
        print(
            "\nЗапрещены GPL/AGPL/SSPL; LGPL (psycopg) разрешён намеренно. "
            "Перечень компонентов — THIRD-PARTY-NOTICES.md.",
            file=sys.stderr,
        )
        return 1

    print(
        f"✓ Гейт лицензий Python: strong-copyleft (GPL/AGPL/SSPL) не обнаружен "
        f"({len(seen)} дистрибутивов проверено; LGPL разрешён)."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
