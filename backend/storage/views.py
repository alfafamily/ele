"""Инлайн-выдача файла с текущего origin — для встроенного просмотрщика PDF.

Ссылки S3-хранилища кросс-доменные (подписанный URL на s3.<провайдер>), и PDF.js
не может прочитать их через `fetch` из-за CORS. Поэтому для PDF фронт грузит файл
через этот прокси на домене приложения (same-origin). Для локального хранилища
ссылка `/media/...` и так same-origin, прокси не нужен — фронт берёт прямой URL.
"""
from django.http import FileResponse, Http404
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from .access import can_access_stored_file
from .backends import get_backend
from .models import StoredFile


class StoredFileInlineView(APIView):
    """Стримит содержимое StoredFile с текущего origin. Только для
    аутентифицированных. `nosniff` всегда; CSP `sandbox` — на всё, кроме PDF (как
    в раздаче `/media`), чтобы прямое открытие html-файла не исполняло скрипты.

    B39/F1: доступ к конкретному файлу проверяется по объекту-владельцу
    (can_access_stored_file) — иначе любой залогиненный перебором id читал бы
    чужие файлы. Отсутствие доступа и несуществующий файл отдаём одинаково (404),
    чтобы нельзя было перебором различать существующие id."""

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            sf = StoredFile.objects.get(pk=pk)
        except StoredFile.DoesNotExist as exc:
            raise Http404 from exc
        if not can_access_stored_file(request.user, sf):
            raise Http404
        content_type = sf.content_type or "application/octet-stream"
        resp = FileResponse(get_backend(sf.backend).open(sf.path), content_type=content_type)
        resp["Content-Disposition"] = "inline"
        resp["X-Content-Type-Options"] = "nosniff"
        if content_type != "application/pdf":
            resp["Content-Security-Policy"] = "sandbox"
        return resp
