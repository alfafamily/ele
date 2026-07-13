import ipaddress


def is_ip_allowed(ip: str, allowlist: list[str]) -> bool:
    """Пустой allowlist = ограничение выключено (§3.1). Непустой — сверяем
    по отдельным адресам и подсетям CIDR; некорректный IP клиента или
    записи allowlist трактуем как "не совпало", не как ошибку 500."""
    if not allowlist:
        return True
    try:
        client = ipaddress.ip_address(ip)
    except ValueError:
        return False
    for entry in allowlist:
        entry = entry.strip()
        try:
            if "/" in entry:
                if client in ipaddress.ip_network(entry, strict=False):
                    return True
            elif client == ipaddress.ip_address(entry):
                return True
        except ValueError:
            continue
    return False
