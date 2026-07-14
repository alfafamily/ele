import ipaddress


def entry_ip(entry) -> str:
    """IP-адрес/подсеть из записи allowlist. Записи теперь — словари
    {"ip": ..., "note": ...}; строки поддерживаются для совместимости со
    старым форматом (данные до миграции 0004)."""
    if isinstance(entry, dict):
        return (entry.get("ip") or "").strip()
    return str(entry).strip()


def is_ip_allowed(ip: str, allowlist: list) -> bool:
    """Пустой allowlist = ограничение выключено. Непустой — сверяем
    по отдельным адресам и подсетям CIDR; некорректный IP клиента или
    записи allowlist трактуем как "не совпало", не как ошибку 500."""
    if not allowlist:
        return True
    try:
        client = ipaddress.ip_address(ip)
    except ValueError:
        return False
    for entry in allowlist:
        value = entry_ip(entry)
        if not value:
            continue
        try:
            if "/" in value:
                if client in ipaddress.ip_network(value, strict=False):
                    return True
            elif client == ipaddress.ip_address(value):
                return True
        except ValueError:
            continue
    return False
