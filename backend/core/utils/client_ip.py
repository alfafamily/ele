def get_client_ip(request) -> str:
    """Реальный IP клиента за Caddy (§8.2, единственный reverse-proxy перед
    Django — backend не публикует порт напрямую, docker-compose.yml). Caddy
    сам ДОПИСЫВАЕТ реальный IP последним в X-Forwarded-For; более ранние
    значения мог подставить сам клиент, поэтому доверяем только последнему."""
    xff = request.META.get("HTTP_X_FORWARDED_FOR")
    if xff:
        return xff.split(",")[-1].strip()
    return request.META.get("REMOTE_ADDR", "")
