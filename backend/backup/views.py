from django.http import FileResponse
from django.shortcuts import get_object_or_404
from rest_framework import generics
from rest_framework.response import Response
from rest_framework.views import APIView

from core.pagination import ELECursorPagination
from core.permissions import IsAdmin
from storage.backends import get_backend

from .models import BackupRecord
from .serializers import BackupRecordSerializer
from .service import create_backup


class BackupCreateView(APIView):
    """«Создать резервную копию сейчас» — доступ строго Администратору."""

    permission_classes = [IsAdmin]

    def post(self, request):
        record = create_backup(BackupRecord.BackupType.MANUAL)
        return Response(BackupRecordSerializer(record).data, status=201)


class BackupListView(generics.ListAPIView):
    serializer_class = BackupRecordSerializer
    permission_classes = [IsAdmin]
    pagination_class = ELECursorPagination

    def get_queryset(self):
        return BackupRecord.objects.select_related("file").all()


class BackupDownloadView(APIView):
    """Файл содержит хэши паролей и все бизнес-данные — стримится
    через авторизованный эндпоинт, а не отдаётся статикой /media/* (см.
    infra/Caddyfile[.dev]: /media/backups/* заблокирован явно)."""

    permission_classes = [IsAdmin]

    def get(self, request, pk):
        record = get_object_or_404(BackupRecord, pk=pk)
        backend = get_backend(record.file.backend)
        file_obj = backend.open(record.file.path)
        return FileResponse(
            file_obj, as_attachment=True, filename=record.file.original_filename, content_type="application/json"
        )
