from django.db import transaction
from rest_framework import serializers

from core.eav import upsert_custom_fields
from storage.serializers import StoredFileSerializer

from .models import Tool, ToolAllocation, ToolCustomField


class ToolCustomFieldSerializer(serializers.ModelSerializer):
    # id — записываемый, чтобы обновлять существующие доп.поля по идентичности
    # (upsert), а не пересоздавать — иначе история изменений шумит.
    id = serializers.IntegerField(required=False)

    class Meta:
        model = ToolCustomField
        fields = ["id", "name", "value"]


class ToolAllocationSerializer(serializers.ModelSerializer):
    """Закрепление части инструмента за сотрудником — для карточки инструмента."""

    employee_name = serializers.SerializerMethodField()
    employee_avatar = serializers.SerializerMethodField()
    department = serializers.SerializerMethodField()

    class Meta:
        model = ToolAllocation
        fields = ["id", "employee", "employee_name", "employee_avatar", "department", "quantity"]

    def get_employee_name(self, obj):
        return str(obj.employee)

    def get_employee_avatar(self, obj):
        if obj.employee.avatar_id:
            return StoredFileSerializer(obj.employee.avatar).data
        return None

    def get_department(self, obj):
        return obj.employee.department


class ToolSerializer(serializers.ModelSerializer):
    allocated = serializers.SerializerMethodField()
    free = serializers.SerializerMethodField()
    allocations = ToolAllocationSerializer(many=True, read_only=True)
    custom_fields = ToolCustomFieldSerializer(many=True, required=False)

    class Meta:
        model = Tool
        fields = [
            "id",
            "name",
            "quantity",
            "allocated",
            "free",
            "allocations",
            "custom_fields",
            "is_written_off",
            "written_off_at",
            "created_at",
        ]
        # quantity — записываемый только при создании (начальный остаток);
        # unit-операции меняют его через отдельные экшены (enforced в update).
        read_only_fields = ["is_written_off", "written_off_at", "created_at"]

    def get_allocated(self, obj):
        return sum(a.quantity for a in obj.allocations.all())

    def get_free(self, obj):
        return obj.quantity - sum(a.quantity for a in obj.allocations.all())

    def validate_name(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("Укажите наименование.")
        return value

    @transaction.atomic
    def create(self, validated_data):
        custom_fields_data = validated_data.pop("custom_fields", [])
        instance = Tool.objects.create(**validated_data)
        upsert_custom_fields(instance, ToolCustomField, "tool", custom_fields_data)
        return instance

    @transaction.atomic
    def update(self, instance, validated_data):
        custom_fields_data = validated_data.pop("custom_fields", None)
        # Остаток меняют только unit-операции (add/write-off-units), не форма.
        validated_data.pop("quantity", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if custom_fields_data is not None:
            upsert_custom_fields(instance, ToolCustomField, "tool", custom_fields_data)
        return instance


class ToolMiniSerializer(serializers.ModelSerializer):
    """Для карточки Сотрудника (блок «Инструменты»)."""

    class Meta:
        model = Tool
        fields = ["id", "name"]
