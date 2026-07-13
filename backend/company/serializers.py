from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from storage.serializers import StoredFileSerializer

from .models import Company


class CompanyBriefSerializer(serializers.ModelSerializer):
    """Название и лого — единственное, что нужно навигации всем ролям (§8.5
    «Навигация»); ИНН/КПП/домен/IP-ограничения/режим хранилища — это раздел
    Настройки → Компания, доступный только Администратору (§2.3)."""

    logo = StoredFileSerializer(read_only=True)

    class Meta:
        model = Company
        fields = ["name", "logo"]


class CompanySettingsSerializer(serializers.ModelSerializer):
    """Настройки → Компания (§3.1, §5.5.1) — основные реквизиты и IP-ограничение.
    Режим хранилища — отдельный эндпоинт (валидация S3-параметров из .env,
    §8.3), лого — отдельный upload-эндпоинт (§8.3), секреты интеграций сюда
    не входят никогда (§8.6)."""

    class Meta:
        model = Company
        fields = ["name", "inn", "kpp", "domain", "ip_allowlist"]

    def validate_ip_allowlist(self, value):
        if not isinstance(value, list) or not all(isinstance(v, str) for v in value):
            raise serializers.ValidationError("Ожидается список строк (IP-адреса или подсети CIDR).")
        return value


class SetupAdminSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)
    password_repeat = serializers.CharField(write_only=True)

    def validate(self, attrs):
        if attrs["password"] != attrs["password_repeat"]:
            raise serializers.ValidationError({"password_repeat": ["Пароли не совпадают."]})
        validate_password(attrs["password"])
        return attrs


class SetupCompanySerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255)
    inn = serializers.CharField(max_length=32, required=False, allow_blank=True, default="")
    kpp = serializers.CharField(max_length=32, required=False, allow_blank=True, default="")


class SetupCompleteSerializer(serializers.Serializer):
    """Хранилище/почта/капча/Яндекс ID сюда не входят — они читаются из
    окружения контейнера и только тестируются (см. EnvironmentStatusView)."""

    admin = SetupAdminSerializer()
    company = SetupCompanySerializer()


class TestEmailRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class VerifyEmailCodeSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=6, min_length=6)


class StorageModeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Company
        fields = ["storage_mode"]


class BackupSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = Company
        fields = ["auto_backup_enabled", "auto_backup_time", "auto_backup_retention"]

    def validate_auto_backup_retention(self, value):
        if value < 1:
            raise serializers.ValidationError("Глубина хранения должна быть не меньше 1.")
        return value
