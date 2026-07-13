from rest_framework import serializers

from .models import StoredFile


class StoredFileSerializer(serializers.ModelSerializer):
    url = serializers.ReadOnlyField()

    class Meta:
        model = StoredFile
        fields = ["id", "url", "original_filename", "content_type", "size"]


class StoredFileErrorSerializer(serializers.ModelSerializer):
    class Meta:
        model = StoredFile
        fields = ["id", "original_filename", "path", "backend", "migration_error"]
