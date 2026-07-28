"""Лёгкий разбор User-Agent — без внешних зависимостей.

Нужен для «слепка устройства» при акцепте (B32): грубо определить браузер, ОС и
тип устройства из строки User-Agent. Это не полноценный ua-parser — достаточная
эвристика для отображения в истории. Точная модель/версия по возможности приходят
с клиента через UA Client Hints (navigator.userAgentData), см. фронт.
"""

import re


def _search(patterns, ua):
    for name, rx in patterns:
        m = re.search(rx, ua)
        if m:
            ver = m.group(1) if m.groups() else ""
            return name, ver
    return None, ""


_BROWSERS = [
    ("Edge", r"Edg(?:e|A|iOS)?/([\d.]+)"),
    ("Opera", r"OPR/([\d.]+)"),
    ("YaBrowser", r"YaBrowser/([\d.]+)"),
    ("Samsung Internet", r"SamsungBrowser/([\d.]+)"),
    ("Firefox", r"Firefox/([\d.]+)"),
    ("Chrome", r"(?:Chrome|CriOS)/([\d.]+)"),
    ("Safari", r"Version/([\d.]+).*Safari"),
]

_OS = [
    ("Windows", r"Windows NT ([\d.]+)"),
    ("Android", r"Android ([\d.]+)"),
    ("iOS", r"(?:iPhone|iPad); CPU (?:iPhone )?OS ([\d_]+)"),
    ("macOS", r"Mac OS X ([\d_]+)"),
    ("Linux", r"(Linux)"),
]

_WINDOWS_NAMES = {"10.0": "10/11", "6.3": "8.1", "6.2": "8", "6.1": "7"}


def parse_user_agent(ua: str) -> dict:
    """Вернуть {browser, browser_version, os, os_version, device_type} по UA-строке.
    Пустые/нераспознанные значения — пустые строки."""
    ua = ua or ""
    browser, bver = _search(_BROWSERS, ua)
    os_name, over = _search(_OS, ua)
    over = over.replace("_", ".")
    if os_name == "Windows":
        over = _WINDOWS_NAMES.get(over, over)

    if re.search(r"iPad|Tablet", ua) or (os_name == "Android" and "Mobile" not in ua):
        device_type = "Планшет"
    elif re.search(r"Mobi|iPhone|Android", ua):
        device_type = "Смартфон"
    elif ua:
        device_type = "Компьютер"
    else:
        device_type = ""

    return {
        "browser": browser or "",
        "browser_version": bver,
        "os": os_name or "",
        "os_version": over,
        "device_type": device_type,
    }
