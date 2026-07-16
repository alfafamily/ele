from rest_framework import serializers

from equipment.serializers import EquipmentMiniSerializer
from locations.models import Building, Room
from locations.serializers import BuildingMiniSerializer, RoomMiniSerializer
from storage.serializers import StoredFileSerializer

from .models import AccessPass, Employee, SimCard


class SimCardSerializer(serializers.ModelSerializer):
    sim_type_display = serializers.CharField(source="get_sim_type_display", read_only=True)
    # Статус вычисляется по привязке: отвязана (employee=NULL) ⇒ деактивирована.
    is_deactivated = serializers.BooleanField(read_only=True)
    employee_name = serializers.SerializerMethodField()
    # Объявлено явно, чтобы уникальность проверялась своим сообщением
    # (validate_phone_number), а не авто-валидатором DRF по UniqueConstraint.
    phone_number = serializers.CharField(max_length=32)

    class Meta:
        model = SimCard
        fields = [
            "id",
            "employee",
            "employee_name",
            "sim_type",
            "sim_type_display",
            "phone_number",
            "network_operator",
            "provider",
            "is_deactivated",
            "created_at",
        ]
        # employee можно задать при создании (сразу привязать) или через
        # action attach/detach; статус is_deactivated — вычисляемый.
        read_only_fields = ["created_at"]

    def get_employee_name(self, obj):
        return str(obj.employee) if obj.employee_id else None

    def validate_phone_number(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Укажите номер телефона.")
        # Уникальность по всем SIM (активным и деактивированным).
        qs = SimCard.objects.filter(phone_number=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("SIM-карта с таким номером уже есть.")
        return value


class AccessPassSerializer(serializers.ModelSerializer):
    # Здания/помещения на чтение — вложенно; на запись — по id. Один пропуск
    # может действовать в нескольких зданиях (buildings — M2M).
    buildings = BuildingMiniSerializer(many=True, read_only=True)
    building_ids = serializers.PrimaryKeyRelatedField(
        source="buildings",
        queryset=Building.objects.filter(is_archived=False),
        many=True,
        write_only=True,
        allow_empty=False,
    )
    rooms = RoomMiniSerializer(many=True, read_only=True)
    room_ids = serializers.PrimaryKeyRelatedField(
        source="rooms",
        queryset=Room.objects.filter(is_archived=False),
        many=True,
        write_only=True,
        required=False,
    )
    is_deactivated = serializers.BooleanField(read_only=True)
    employee_name = serializers.SerializerMethodField()
    # Явно — чтобы уникальность непустого номера проверялась своим сообщением.
    account_number = serializers.CharField(max_length=64, required=False, allow_blank=True)

    class Meta:
        model = AccessPass
        fields = [
            "id",
            "employee",
            "employee_name",
            "name",
            "account_number",
            "type_vehicle",
            "type_pedestrian",
            "buildings",
            "building_ids",
            "rooms",
            "room_ids",
            "is_deactivated",
            "created_at",
        ]
        # employee можно задать при создании (сразу привязать) или через
        # action attach/detach; статус is_deactivated — вычисляемый.
        read_only_fields = ["created_at"]

    def get_employee_name(self, obj):
        return str(obj.employee) if obj.employee_id else None

    def validate_account_number(self, value):
        value = value.strip()
        # Уникальность — только среди непустых учётных номеров.
        if value:
            qs = AccessPass.objects.filter(account_number=value)
            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError("Пропуск с таким учётным номером уже есть.")
        return value

    def validate(self, attrs):
        # Каждое выбранное помещение должно принадлежать одному из выбранных зданий.
        buildings = attrs.get("buildings")
        if buildings is None:
            buildings = list(self.instance.buildings.all()) if self.instance else []
        rooms = attrs.get("rooms")
        building_ids = {b.id for b in buildings}
        if rooms and any(r.building_id not in building_ids for r in rooms):
            raise serializers.ValidationError(
                {"room_ids": "Помещения должны относиться к выбранным зданиям."}
            )
        return attrs


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
    passes = serializers.SerializerMethodField()
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
            "passes",
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

    def get_passes(self, obj):
        # И активные, и деактивированные пропуска (для истории).
        return AccessPassSerializer(obj.passes.all(), many=True).data

    def get_user_email(self, obj):
        return obj.user.email if hasattr(obj, "user") else None
