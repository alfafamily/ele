from django.db import transaction
from rest_framework import serializers

from core.eav import apply_field_values, missing_required_fields, upsert_custom_fields
from equipment.serializers import EquipmentMiniSerializer
from storage.serializers import StoredFileSerializer

from .models import License, LicenseCustomField, LicenseFieldValue, LicenseType, LicenseTypeField


class LicenseTypeFieldSerializer(serializers.ModelSerializer):
    class Meta:
        model = LicenseTypeField
        fields = ["id", "license_type", "name", "value_type", "is_required", "is_locked"]
        read_only_fields = ["license_type", "is_locked"]

    def validate(self, attrs):
        # «Номер/ключ» у «Программной» — нельзя переименовать/сделать необязательным (§3.7).
        if self.instance and self.instance.is_locked:
            if "name" in attrs and attrs["name"] != self.instance.name:
                raise serializers.ValidationError({"name": ["Зафиксированный реквизит нельзя переименовать."]})
            if attrs.get("is_required") is False:
                raise serializers.ValidationError({"is_required": ["Зафиксированный реквизит нельзя сделать необязательным."]})
        return attrs


class LicenseTypeSerializer(serializers.ModelSerializer):
    fields = LicenseTypeFieldSerializer(many=True, read_only=True)
    objects_count = serializers.IntegerField(source="licenses.count", read_only=True)

    class Meta:
        model = LicenseType
        fields = ["id", "name", "is_archived", "is_locked", "fields", "objects_count"]
        read_only_fields = ["is_locked"]

    def validate(self, attrs):
        if self.instance and self.instance.is_locked and "name" in attrs and attrs["name"] != self.instance.name:
            raise serializers.ValidationError({"name": ["Базовый Тип лицензии нельзя переименовать."]})
        return attrs


class LicenseFieldValueInputSerializer(serializers.Serializer):
    field = serializers.PrimaryKeyRelatedField(queryset=LicenseTypeField.objects.all())
    value = serializers.JSONField(required=False, allow_null=True)


class LicenseFieldValueOutSerializer(serializers.ModelSerializer):
    """Значение «Номер/ключ» видно только здесь (карточка), никогда в списках (§3.7)."""

    name = serializers.CharField(source="field.name", read_only=True)
    value_type = serializers.CharField(source="field.value_type", read_only=True)
    value = serializers.SerializerMethodField()
    value_file = StoredFileSerializer(read_only=True)

    class Meta:
        model = LicenseFieldValue
        fields = ["field", "name", "value_type", "value", "value_file"]

    def get_value(self, obj):
        if obj.field.value_type == "file":
            return None
        return getattr(obj, f"value_{obj.field.value_type}")


class LicenseCustomFieldSerializer(serializers.ModelSerializer):
    # id — записываемый: upsert доп.полей по идентичности (см. equipment).
    id = serializers.IntegerField(required=False)

    class Meta:
        model = LicenseCustomField
        fields = ["id", "name", "value"]


class LicenseSerializer(serializers.ModelSerializer):
    """Карточка объекта — используется на retrieve/create/update. Включает
    «Номер/ключ» через field_values (§3.7: доступно только в карточке, роль
    уже ограничена на уровне permission_classes раздела «Лицензии»)."""

    license_type_name = serializers.CharField(source="license_type.name", read_only=True)
    equipment_detail = EquipmentMiniSerializer(source="equipment", read_only=True)
    status = serializers.SerializerMethodField()
    field_values = LicenseFieldValueOutSerializer(many=True, read_only=True)
    custom_fields = LicenseCustomFieldSerializer(many=True, required=False)
    field_values_input = LicenseFieldValueInputSerializer(many=True, required=False, write_only=True)

    class Meta:
        model = License
        fields = [
            "id",
            "name",
            "equipment",
            "equipment_detail",
            "is_retired",
            "retired_at",
            "license_type",
            "license_type_name",
            "status",
            "field_values",
            "field_values_input",
            "custom_fields",
            "created_at",
        ]
        read_only_fields = ["is_retired", "retired_at", "created_at"]

    def get_status(self, obj):
        return "assigned" if obj.equipment_id else "free"

    def validate(self, attrs):
        license_type = attrs.get("license_type") or getattr(self.instance, "license_type", None)
        field_values_input = attrs.get("field_values_input")
        if field_values_input:
            for item in field_values_input:
                if item["field"].license_type_id != license_type.pk:
                    raise serializers.ValidationError(
                        {"field_values": [f"Реквизит «{item['field'].name}» не относится к выбранному Типу."]}
                    )
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        field_values_input = validated_data.pop("field_values_input", [])
        custom_fields_data = validated_data.pop("custom_fields", [])
        instance = License.objects.create(**validated_data)
        if field_values_input:
            apply_field_values(instance, "license", LicenseFieldValue, field_values_input, instance.license_type.fields.all())
        upsert_custom_fields(instance, LicenseCustomField, "license", custom_fields_data)
        self._raise_if_missing_required(instance)
        return instance

    @transaction.atomic
    def update(self, instance, validated_data):
        field_values_input = validated_data.pop("field_values_input", None)
        custom_fields_data = validated_data.pop("custom_fields", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if field_values_input is not None:
            apply_field_values(instance, "license", LicenseFieldValue, field_values_input, instance.license_type.fields.all())
        if custom_fields_data is not None:
            upsert_custom_fields(instance, LicenseCustomField, "license", custom_fields_data)
        self._raise_if_missing_required(instance)
        return instance

    def _raise_if_missing_required(self, instance):
        # Утилизация — отдельное действие, сюда не заходит (исключение §5.4).
        missing = missing_required_fields(instance, "field_values", instance.license_type.fields)
        if missing:
            names = ", ".join(f.name for f in missing)
            raise serializers.ValidationError({"field_values": [f"Не заполнены обязательные реквизиты: {names}."]})


class LicenseListSerializer(serializers.ModelSerializer):
    """Список — «Номер/ключ» физически отсутствует в выдаче (§3.7), не просто скрыт на фронте."""

    license_type_name = serializers.CharField(source="license_type.name", read_only=True)
    equipment_detail = EquipmentMiniSerializer(source="equipment", read_only=True)
    status = serializers.SerializerMethodField()

    class Meta:
        model = License
        fields = [
            "id",
            "name",
            "license_type",
            "license_type_name",
            "equipment",
            "equipment_detail",
            "status",
            "retired_at",
            "created_at",
        ]

    def get_status(self, obj):
        return "assigned" if obj.equipment_id else "free"


class LicenseMiniSerializer(serializers.ModelSerializer):
    """Для вложенных списков (блок «Установленные лицензии» карточки Оборудования)."""

    license_type_name = serializers.CharField(source="license_type.name", read_only=True)

    class Meta:
        model = License
        fields = ["id", "name", "license_type_name"]
