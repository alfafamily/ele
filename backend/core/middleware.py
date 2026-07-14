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
