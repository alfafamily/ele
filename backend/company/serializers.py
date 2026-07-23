import ipaddress

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from storage.serializers import StoredFileSerializer

from .models import Company


def clean_ip_allowlist(value):
    """Нормализует список записей IP-allowlist ({ip, note}); проверяет каждый
    адрес/подсеть CIDR. Общий для ограничения входа и админ-доступа (B9)."""
    if not isinstance(value, list):
        raise serializers.ValidationError("Ожидается список записей {ip, note}.")
    cleaned = []
    for item in value:
        if not isinstance(item, dict):
            raise serializers.ValidationError("Каждая запись — объект {ip, note}.")
        ip = (item.get("ip") or "").strip()
        note = (item.get("note") or "").strip()
        if not ip:
            raise serializers.ValidationError("IP-адрес не может быть пустым.")
        try:
            ipaddress.ip_network(ip, strict=False) if "/" in ip else ipaddress.ip_address(ip)
        except ValueError:
            raise serializers.ValidationError(f"«{ip}» — не корректный IP-адрес или подсеть CIDR.")
        cleaned.append({"ip": ip, "note": note})
    return cleaned


class CompanyBriefSerializer(serializers.ModelSerializer):
    """Название и лого — единственное, что нужно навигации всем ролям
    («Навигация»); ИНН/домен/IP-ограничения/режим хранилища — это раздел
    Настройки → Компания, доступный только Администратору."""

    logo = StoredFileSerializer(read_only=True)

    class Meta:
        model = Company
        fields = ["name", "logo"]


class CompanySettingsSerializer(serializers.ModelSerializer):
    """Настройки → Компания — основные реквизиты и IP-ограничение.
    Режим хранилища — отдельный эндпоинт (валидация S3-параметров из .env),
    лого — отдельный upload-эндпоинт, секреты интеграций сюда
    не входят никогда."""

    class Meta:
        model = Company
        fields = [
            "name", "inn", "domain", "ip_allowlist", "open_registration",
            "admin_access_enabled", "admin_access_ips",
        ]

    def validate_ip_allowlist(self, value):
        return clean_ip_allowlist(value)

    def validate_admin_access_ips(self, value):
        return clean_ip_allowlist(value)

    def validate(self, attrs):
        # B9: включённый доступ в админку обязан иметь хотя бы один IP — иначе
        # раздел был бы открыт «всем», чего мы не допускаем. При PATCH берём
        # эффективные значения (из payload либо из текущего объекта).
        enabled = attrs.get(
            "admin_access_enabled",
            getattr(self.instance, "admin_access_enabled", False),
        )
        ips = attrs.get("admin_access_ips", getattr(self.instance, "admin_access_ips", None))
        if enabled and not ips:
            raise serializers.ValidationError(
                {"admin_access_ips": ["Добавьте хотя бы один разрешённый IP-адрес для доступа в админ-панель."]}
            )
        return attrs

    def update(self, instance, validated_data):
        # B9: при выключении доступа снимаем права редактирования (is_superuser)
        # у всех — чтобы закрытие раздела гарантированно отбирало и права правки.
        was_enabled = instance.admin_access_enabled
        company = super().update(instance, validated_data)
        if was_enabled and not company.admin_access_enabled:
            get_user_model().objects.filter(is_superuser=True).update(is_superuser=False)
        return company


class SetupAdminSerializer(serializers.Serializer):
    last_name = serializers.CharField(max_length=150)
    first_name = serializers.CharField(max_length=150)
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


class NumberingSettingsSerializer(serializers.ModelSerializer):
    """Настройки → Префиксы: базовые префиксы автонумератора учётных номеров
    (B2). Счётчики (`*_number_seq`) не редактируются через API — только растут
    при генерации и не сбрасываются при смене префикса."""

    class Meta:
        model = Company
        fields = ["equipment_number_prefix", "key_number_prefix", "pass_number_prefix"]

    @staticmethod
    def _clean_prefix(value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Префикс не может быть пустым.")
        return value

    def validate_equipment_number_prefix(self, value):
        return self._clean_prefix(value)

    def validate_key_number_prefix(self, value):
        return self._clean_prefix(value)

    def validate_pass_number_prefix(self, value):
        return self._clean_prefix(value)

    _PREFIX_FIELDS = ("equipment_number_prefix", "key_number_prefix", "pass_number_prefix")

    def validate(self, attrs):
        # Префиксы должны различаться между видами объектов — иначе номера разных
        # списков пересекались бы (например KEY-1 и у ключа, и у пропуска).
        # Сравниваем без учёта регистра; при PATCH недостающие поля берём из
        # текущих значений. Ошибку кладём на редактируемое поле (из payload).
        effective = {
            f: attrs.get(f) if attrs.get(f) is not None else (getattr(self.instance, f) if self.instance else "")
            for f in self._PREFIX_FIELDS
        }
        norm = {f: effective[f].strip().casefold() for f in self._PREFIX_FIELDS}
        errors = {}
        for f in self._PREFIX_FIELDS:
            if f not in attrs:
                continue
            if any(other != f and norm[f] and norm[f] == norm[other] for other in self._PREFIX_FIELDS):
                errors[f] = "Префикс должен отличаться от префиксов других видов объектов."
        if errors:
            raise serializers.ValidationError(errors)
        return attrs


class BackupSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = Company
        fields = ["auto_backup_enabled", "auto_backup_time", "auto_backup_retention"]

    def validate_auto_backup_retention(self, value):
        if value < 1:
            raise serializers.ValidationError("Глубина хранения должна быть не меньше 1.")
        return value
