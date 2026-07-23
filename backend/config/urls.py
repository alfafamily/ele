"""
URL configuration for config project.
"""
from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    # B9: служебная Django-админка вынесена с /admin на /django_admin и закрыта
    # гейтом (core.middleware.AdminAccessGateMiddleware — глобальный флаг + IP).
    path("django_admin/", admin.site.urls),
    path("api/", include("core.urls")),
    path("api/", include("accounts.urls")),
    path("api/", include("company.urls")),
    path("api/", include("equipment.urls")),
    path("api/", include("tools.urls")),
    path("api/", include("licenses.urls")),
    path("api/", include("locations.urls")),
    path("api/", include("employees.urls")),
    path("api/", include("backup.urls")),
]

if settings.DEBUG:
    # В проде media/static раздаёт Caddy напрямую (infra/Caddyfile), в dev —
    # сам Django, чтобы не поднимать лишний слой ради локальной разработки.
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

