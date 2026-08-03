"""Троттлинг попыток входа (B39/F8)."""
from rest_framework.throttling import SimpleRateThrottle

from core.utils.client_ip import get_client_ip


class LoginRateThrottle(SimpleRateThrottle):
    """IP-лимит попыток входа — второй слой поверх пер-аккаунтной блокировки
    (accounts.LoginView: капча с 3-й попытки, блок на 5 минут после 5-й).

    Пер-аккаунтный lockout не мешает распределённому перебору по РАЗНЫМ аккаунтам
    с одного адреса и позволяет намеренно блокировать чужие аккаунты; лимит по IP
    закрывает шквал запросов с одного источника независимо от того, какие
    аккаунты он перебирает.

    Ключ — реальный IP за Caddy (последний в X-Forwarded-For, см.
    core.utils.client_ip), а не REMOTE_ADDR прокси: иначе все клиенты делили бы
    один общий лимит.
    """

    scope = "login"

    def get_cache_key(self, request, view):
        return self.cache_format % {"scope": self.scope, "ident": get_client_ip(request) or "unknown"}
