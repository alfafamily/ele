from django.http import FileResponse
from django.shortcuts import get_object_or_404
from rest_framework import generics
from rest_framework.response import Response
from rest_framework.views import APIView

from core.pagination import ELECursorPagination
from core.permissions import IsAdmin
from storage.backends import get_backend

from .destinations import test_secondary_s3_connection
from .models import BackupRecord
from .serializers import BackupCreateSerializer, BackupRecordSerializer
from .service import backup_fully_failed, create_backup


class BackupCreateView(APIView):
    """«Создать резервную копию сейчас» — доступ строго Администратору.
    Опционально шифрует паролем и выгружает на резервный S3."""

    permission_classes = [IsAdmin]

    def post(self, request):
        params = BackupCreateSerializer(data=request.data)
        params.is_valid(raise_exception=True)
        passphrase = params.validated_data.get("passphrase") or None
        to_secondary = params.validated_data.get("to_secondary")  # None = по настройкам Компании

        record = create_backup(
            BackupRecord.BackupType.MANUAL,
            passphrase=passphrase,
            to_secondary=to_secondary,
        )
        data = BackupRecordSerializer(record).data
        # Ни одно назначение не удалось — сообщаем ошибкой, но запись со статусами
        # уже создана (видна в истории), тело ответа её содержит.
        if backup_fully_failed(record):
            return Response(data, status=502)
        return Response(data, status=201)


class BackupListView(generics.ListAPIView):
    serializer_class = BackupRecordSerializer
    permission_classes = [IsAdmin]
    pagination_class = ELECursorPagination

    def get_queryset(self):
        return BackupRecord.objects.select_related("file").prefetch_related("destinations").all()


class BackupDownloadView(APIView):
    """Файл содержит хэши паролей и все бизнес-данные — стримится
    через авторизованный эндпоинт, а не отдаётся статикой /media/* (см.
    infra/Caddyfile[.dev]: /media/backups/* заблокирован явно)."""

    permission_classes = [IsAdmin]

    def get(self, request, pk):
        record = get_object_or_404(BackupRecord, pk=pk)
        if record.file is None:
            return Response(
                {"detail": "Собственная копия отсутствует — доступна только на резервном S3."},
                status=409,
            )
        backend = get_backend(record.file.backend)
        file_obj = backend.open(record.file.path)
        content_type = "application/octet-stream" if record.encrypted else "application/gzip"
        filename = record.filename or record.file.original_filename
        return FileResponse(file_obj, as_attachment=True, filename=filename, content_type=content_type)


class BackupSecondaryS3TestView(APIView):
    """«Проверить подключение» к резервному S3 (креды из .env). Только Админ."""

    permission_classes = [IsAdmin]

    def post(self, request):
        ok, error = test_secondary_s3_connection()
        if not ok:
            return Response({"detail": error or "Проверка не пройдена."}, status=400)
        return Response({"detail": "Подключение к резервному S3 успешно."})
