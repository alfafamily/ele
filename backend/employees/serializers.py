from rest_framework import serializers

from equipment.serializers import EquipmentMiniSerializer
from storage.serializers import StoredFileSerializer

from .models import Employee, SimCard


class SimCardSerializer(serializers.ModelSerializer):
    sim_type_display = serializers.CharField(source="get_sim_type_display", read_only=True)

    class Meta:
        model = SimCard
        fields = [
            "id",
            "employee",
            "sim_type",
            "sim_type_display",
            "phone_number",
            "network_operator",
            "provider",
            "is_deactivated",
            "deactivated_at",
            "created_at",
        ]
        # Деактивация — только через отдельный action, не через запись поля.
        read_only_fields = ["is_deactivated", "deactivated_at", "created_at"]

    def validate_phone_number(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Укажите номер телефона.")
        return value


# Списанное (архивное) Оборудование не считается закреплённым за Сотрудником —
# в списке/карточке и в счётчике показываем только активное .
def _active_equipment(employee):
    return [eq for eq in employee.equipment.all() if not eq.is_written_off]


class EmployeeListSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()
    equipment_count = serializers.SerializerMethodField()
    # Аватар — только чтение здесь: загрузка/замена через отдельный
    # EmployeeAvatarUploadView (multipart), как и Company.logo .
    avatar = StoredFileSerializer(read_only=True)

    class Meta:
        model = Employee
        fields = [
            "id",
            "first_name",
            "last_name",
            "full_name",
            "position",
            "department",
            "avatar",
            "equipment_count",
            "is_employed",
        ]

    def get_full_name(self, obj):
        return str(obj)

    def get_equipment_count(self, obj):
        return len(_active_equipment(obj))


class EmployeeSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()
    equipment = serializers.SerializerMethodField()
    sim_cards = serializers.SerializerMethodField()
    user_email = serializers.SerializerMethodField()
    avatar = StoredFileSerializer(read_only=True)

    class Meta:
        model = Employee
        fields = [
            "id",
            "first_name",
            "last_name",
            "full_name",
            "position",
            "department",
            "avatar",
            "is_employed",
            "equipment",
            "sim_cards",
            "user_email",
        ]
        read_only_fields = ["is_employed"]

    def get_full_name(self, obj):
        return str(obj)

    def get_equipment(self, obj):
        return EquipmentMiniSerializer(_active_equipment(obj), many=True).data

    def get_sim_cards(self, obj):
        # Показываем и активные, и деактивированные (для истории). Порядок —
        # из Meta.ordering модели: активные выше архивных.
        return SimCardSerializer(obj.sim_cards.all(), many=True).data

    def get_user_email(self, obj):
        return obj.user.email if hasattr(obj, "user") else None
