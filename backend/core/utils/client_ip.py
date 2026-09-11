from django.conf import settings


def get_client_ip(request) -> str:
    """Реальный IP клиента с учётом цепочки обратных прокси перед Django.

    Каждый прокси ДОПИСЫВАЕТ IP подключившегося к нему хоста в конец
    X-Forwarded-For, поэтому правые элементы списка добавлены нашими прокси, а
    левые мог подставить сам клиент. Настройка ``TRUSTED_PROXY_HOPS`` — число
    доверенных прокси перед Django (по умолчанию 1 = единственный Caddy из
    docker-compose): реальный клиент — это (hops)-й элемент справа.

    Так подделка не проходит: сколько бы записей клиент ни вписал в XFF, наши
    прокси допишут реальные connection-IP правее, и отсчёт справа их отсекает.
    При dev-запросе без прокси (XFF пуст) берём REMOTE_ADDR. Если в XFF меньше
    записей, чем ожидаемых хопов (мисконфигурация прокси), берём самый левый —
    ближайший к клиенту из доступных, не доверяя адресу прокси.
    """
    hops = max(getattr(settings, "TRUSTED_PROXY_HOPS", 1), 1)
    xff = request.META.get("HTTP_X_FORWARDED_FOR")
    if xff:
        parts = [p.strip() for p in xff.split(",") if p.strip()]
        if parts:
            idx = hops if len(parts) >= hops else len(parts)
            return parts[-idx]
    return request.META.get("REMOTE_ADDR", "")
