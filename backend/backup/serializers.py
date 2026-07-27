from rest_framework import serializers

from .models import BackupDestinationStatus, BackupRecord


class BackupDestinationStatusSerializer(serializers.ModelSerializer):
    class Meta:
        model = BackupDestinationStatus
        fields = ["destination", "ok", "error", "object_key", "size"]


class BackupRecordSerializer(serializers.ModelSerializer):
    destinations = BackupDestinationStatusSerializer(many=True, read_only=True)
    # Скачать можно own-копию (её StoredFile сохранён) ИЛИ копию на резервном S3
    # (когда S3 настроен и объект успешно загружен) — бэкенд стримит её через
    # авторизованный эндпоинт.
    downloadable = serializers.SerializerMethodField()

    class Meta:
        model = BackupRecord
        fields = [
            "id",
            "created_at",
            "backup_type",
            "format",
            "encrypted",
            "filename",
            "size",
            "app_version",
            "destinations",
            "downloadable",
        ]

    def get_downloadable(self, obj):
        # own-копия: ссылку показываем, только если файл РЕАЛЬНО существует —
        # иначе запись с удалённым (вне приложения) файлом давала бы битую ссылку.
        if obj.file_id is not None:
            from storage.backends import get_backend

            try:
                return get_backend(obj.file.backend).exists(obj.file.path)
            except Exception:  # noqa: BLE001 — недоступное хранилище → не скачиваемо
                return False
        from .destinations import secondary_s3_configured

        if not secondary_s3_configured():
            return False
        # .all() переиспользует prefetch_related из BackupListView (без доп. запроса).
        return any(
            d.destination == BackupDestinationStatus.Destination.SECONDARY_S3 and d.ok and d.object_key
            for d in obj.destinations.all()
        )


class BackupCreateSerializer(serializers.Serializer):
    """Параметры ручного создания копии. Пусто = без шифрования. Назначение —
    единая настройка Company.backup_destination (в «Системные»)."""

    passphrase = serializers.CharField(required=False, allow_blank=True, default="")
