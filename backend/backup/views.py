import os
import tempfile

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
    Опционально шифрует паролем; назначение — единая настройка
    Company.backup_destination (см. «Системные»)."""

    permission_classes = [IsAdmin]

    def post(self, request):
        params = BackupCreateSerializer(data=request.data)
        params.is_valid(raise_exception=True)
        passphrase = params.validated_data.get("passphrase") or None
        record = create_backup(BackupRecord.BackupType.MANUAL, passphrase=passphrase)
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
    infra/Caddyfile[.dev]: /media/backups/* заблокирован явно).

    Отдаёт own-копию (из хранилища инстанса) либо, если её нет, копию с
    резервного S3 (скачивается во временный файл и стримится)."""

    permission_classes = [IsAdmin]

    def get(self, request, pk):
        record = get_object_or_404(BackupRecord, pk=pk)
        content_type = "application/octet-stream" if record.encrypted else "application/gzip"
        filename = record.filename or (record.file.original_filename if record.file else "backup")

        if record.file is not None:
            backend = get_backend(record.file.backend)
            # Файл мог быть удалён вне приложения — тогда не 500, а попытка отдать
            # с резервного S3 ниже (или корректный 409).
            if backend.exists(record.file.path):
                file_obj = backend.open(record.file.path)
                return FileResponse(file_obj, as_attachment=True, filename=filename, content_type=content_type)

        # Own-копии нет (или её файл пропал) — пробуем отдать с резервного S3.
        from .destinations import download_secondary_s3, secondary_s3_configured
        from .models import BackupDestinationStatus

        dest = next(
            (
                d
                for d in record.destinations.all()
                if d.destination == BackupDestinationStatus.Destination.SECONDARY_S3 and d.ok and d.object_key
            ),
            None,
        )
        if not (dest and secondary_s3_configured()):
            return Response(
                {"detail": "Копия недоступна для скачивания (нет own-копии, резервный S3 не настроен)."},
                status=409,
            )
        # Скачиваем во временный файл, открываем его и сразу удаляем из ФС: на
        # Linux данные остаются доступны через открытый дескриптор до закрытия
        # ответом, а файл не копится на диске.
        fd, tmp_path = tempfile.mkstemp(prefix="ele-bk-dl-")
        os.close(fd)
        try:
            download_secondary_s3(dest.object_key, tmp_path)
            file_obj = open(tmp_path, "rb")
        except Exception as exc:  # noqa: BLE001
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
            return Response({"detail": f"Не удалось скачать копию с резервного S3: {exc}"}, status=502)
        os.remove(tmp_path)
        return FileResponse(file_obj, as_attachment=True, filename=filename, content_type=content_type)


class BackupDeleteView(APIView):
    """Удаление копии из истории (с подтверждением в UI). Сносит артефакты:
    объект резервного S3 и/или own-StoredFile (его CASCADE снимает саму запись
    со статусами); если own-копии нет — удаляем запись напрямую."""

    permission_classes = [IsAdmin]

    def delete(self, request, pk):
        from storage.service import delete_stored_file

        from .destinations import SECONDARY_S3, delete_secondary_s3_object

        record = get_object_or_404(BackupRecord, pk=pk)
        for dest in record.destinations.all():
            if dest.destination == SECONDARY_S3 and dest.object_key:
                delete_secondary_s3_object(dest.object_key)
        if record.file_id:
            delete_stored_file(record.file)  # CASCADE снимет BackupRecord + статусы
        else:
            record.delete()
        return Response(status=204)


class BackupSecondaryS3TestView(APIView):
    """«Проверить подключение» к резервному S3 (креды из .env). Только Админ."""

    permission_classes = [IsAdmin]

    def post(self, request):
        ok, error = test_secondary_s3_connection()
        if not ok:
            return Response({"detail": error or "Проверка не пройдена."}, status=400)
        return Response({"detail": "Подключение к резервному S3 успешно."})
