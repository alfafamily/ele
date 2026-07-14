from rest_framework import serializers

from equipment.serializers import EquipmentMiniSerializer
from storage.serializers import StoredFileSerializer

from .models import Employee


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
            "user_email",
        ]
        read_only_fields = ["is_employed"]

    def get_full_name(self, obj):
        return str(obj)

    def get_equipment(self, obj):
        return EquipmentMiniSerializer(_active_equipment(obj), many=True).data

    def get_user_email(self, obj):
        return obj.user.email if hasattr(obj, "user") else None
