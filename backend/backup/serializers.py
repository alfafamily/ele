from rest_framework import serializers

from .models import BackupDestinationStatus, BackupRecord


class BackupDestinationStatusSerializer(serializers.ModelSerializer):
    class Meta:
        model = BackupDestinationStatus
        fields = ["destination", "ok", "error", "object_key", "size"]


class BackupRecordSerializer(serializers.ModelSerializer):
    destinations = BackupDestinationStatusSerializer(many=True, read_only=True)
    # own-копию можно скачать, только если её StoredFile сохранён.
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
        return obj.file_id is not None


class BackupCreateSerializer(serializers.Serializer):
    """Параметры ручного создания копии. Пусто = без шифрования, назначение —
    хранилище приложения по умолчанию."""

    passphrase = serializers.CharField(required=False, allow_blank=True, default="")
    destination = serializers.ChoiceField(
        choices=[BackupDestinationStatus.Destination.OWN, BackupDestinationStatus.Destination.SECONDARY_S3],
        required=False,
        default=BackupDestinationStatus.Destination.OWN,
    )
