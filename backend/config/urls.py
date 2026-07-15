"""
URL configuration for config project.
"""
from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("core.urls")),
    path("api/", include("accounts.urls")),
    path("api/", include("company.urls")),
    path("api/", include("equipment.urls")),
    path("api/", include("licenses.urls")),
    path("api/", include("locations.urls")),
    path("api/", include("employees.urls")),
    path("api/", include("backup.urls")),
]

if settings.DEBUG:
    # В проде media/static раздаёт Caddy напрямую (infra/Caddyfile), в dev —
    # сам Django, чтобы не поднимать лишний слой ради локальной разработки.
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

