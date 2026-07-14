from django.db import connection
from django.shortcuts import render
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .ip_allowlist import is_ip_allowed
from .utils.client_ip import get_client_ip


@api_view(["GET"])
@permission_classes([AllowAny])
def health(request):
    with connection.cursor() as cursor:
        cursor.execute("SELECT 1")
    return Response({"status": "ok"})


@api_view(["GET"])
@permission_classes([AllowAny])
def ip_check(request):
    """Проверка IP клиента для Caddy `forward_auth` — единственный
    способ реально заблокировать ВСЕ страницы сервиса (включая форму логина),
    а не только вызовы API: Django не отдаёт SPA-шелл в проде, это делает
    Caddy/frontend напрямую, поэтому блокировка должна стоять перед ним, не
    внутри Django-миддлвари. При самоблокировке администратора — сброс через
    `manage.py reset_ip_allowlist` на сервере, не через HTTP."""
    from company.models import Company

    company = Company.load()
    if is_ip_allowed(get_client_ip(request), company.ip_allowlist):
        return Response({"detail": "ok"})
    # Отказ. Caddy forward_auth отдаёт тело этого 403 клиенту как есть,
    # поэтому браузеру возвращаем стилизованную под дизайн-систему страницу
    # (иначе виден сырой DRF browsable-API), а API-клиенту — прежний JSON.
    if "text/html" in request.headers.get("Accept", ""):
        return render(request, "errors/403_ip.html", status=403)
    return Response(
        {"detail": "Доступ с этого IP-адреса ограничен администратором компании."}, status=403
    )
