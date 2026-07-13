from rest_framework import serializers

from .models import BackupRecord


class BackupRecordSerializer(serializers.ModelSerializer):
    size = serializers.IntegerField(source="file.size", read_only=True)

    class Meta:
        model = BackupRecord
        fields = ["id", "created_at", "backup_type", "size"]
