from django.http import HttpResponseNotFound

from core.ip_allowlist import is_ip_allowed
from core.utils.client_ip import get_client_ip


class AdminAccessGateMiddleware:
    """B9. Гейт служебной Django-админки (/django_admin). Пропускает запрос
    только если в Настройках включён флаг доступа И IP клиента входит в отдельный
    admin-allowlist. Иначе — 404 (скрываем существование раздела). Роль и
    readonly-режим разруливаются дальше (is_staff/Django-права + core.admin
    mixin). Пустой admin-allowlist трактуем как «закрыто», в отличие от
    allowlist входа в приложение (там пустой = без ограничений)."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # Покрываем и путь без завершающего слэша: `/django_admin` Django сам
        # редиректит на `/django_admin/` (APPEND_SLASH), но гейт должен отработать
        # и на нём, иначе запрос уходит мимо (в проде — в SPA).
        if request.path == "/django_admin" or request.path.startswith("/django_admin/"):
            # Импорт внутри — избегаем цикла на этапе загрузки (core грузится рано).
            from company.models import Company

            company = Company.load()
            ips = company.admin_access_ips or []
            if not company.admin_access_enabled or not ips or not is_ip_allowed(get_client_ip(request), ips):
                return HttpResponseNotFound()
        return self.get_response(request)


class MediaSecurityHeadersMiddleware:
    """CSP `sandbox` на пользовательские файлы, которые Django отдаёт в dev
    (в проде их отдаёт Caddy с теми же заголовками, см. infra/Caddyfile).

    Файлы реквизитов/аватары отдаются inline для встроенного просмотрщика;
    загруженный html/svg со скриптом иначе исполнился бы в origin
    приложения (stored XSS). `sandbox` без allow-scripts/allow-same-origin
    лишает такой документ прав на скрипты и собственный origin, не мешая показу
    изображений и PDF. nosniff — против MIME-подмены.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        if request.path.startswith("/media/"):
            response.setdefault("Content-Security-Policy", "sandbox")
            response.setdefault("X-Content-Type-Options", "nosniff")
        return response
