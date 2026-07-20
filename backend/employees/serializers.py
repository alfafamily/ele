from rest_framework import serializers

from equipment.serializers import EquipmentMiniSerializer
from locations.models import Building, Place, Room
from locations.serializers import BuildingMiniSerializer, PlaceMiniSerializer, RoomMiniSerializer
from storage.serializers import StoredFileSerializer

from .models import AccessPass, Employee, SimCard


def place_detail(place):
    """Краткое описание Места для карточек (склад/рабочее место)."""
    if place is None:
        return None
    return {
        "id": place.id,
        "name": place.name,
        "place_type": place.place_type,
        "room_name": place.room.name,
        "building_name": place.room.building.name,
    }


class SimCardSerializer(serializers.ModelSerializer):
    sim_type_display = serializers.CharField(source="get_sim_type_display", read_only=True)
    # «Неиспользуемая» (не за сотрудником и не в оборудовании, не утилизирована).
    is_deactivated = serializers.BooleanField(read_only=True)
    employee_name = serializers.SerializerMethodField()
    # Размещение (B8): SIM за сотрудником ИЛИ за оборудованием; свободная — на складе.
    equipment_name = serializers.SerializerMethodField()
    storage_place_detail = serializers.SerializerMethodField()
    # Объявлено явно, чтобы уникальность проверялась своим сообщением
    # (validate_phone_number), а не авто-валидатором DRF по UniqueConstraint.
    phone_number = serializers.CharField(max_length=32)

    class Meta:
        model = SimCard
        fields = [
            "id",
            "employee",
            "employee_name",
            "equipment",
            "equipment_name",
            "storage_place",
            "storage_place_detail",
            "sim_type",
            "sim_type_display",
            "phone_number",
            "network_operator",
            "provider",
            "is_deactivated",
            "is_utilized",
            "utilized_at",
            "created_at",
        ]
        # employee/equipment можно задать при создании (сразу разместить) или
        # через action attach/detach; статусы is_deactivated/is_utilized — read-only,
        # утилизация только через action utilize.
        read_only_fields = ["created_at", "is_utilized", "utilized_at"]

    def get_employee_name(self, obj):
        return str(obj.employee) if obj.employee_id else None

    def get_equipment_name(self, obj):
        return str(obj.equipment) if obj.equipment_id else None

    def get_storage_place_detail(self, obj):
        return place_detail(obj.storage_place) if obj.storage_place_id else None

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

    def validate(self, attrs):
        # Размещение: не более одного из {employee, equipment}; при создании
        # свободной SIM (без сотрудника и оборудования) обязателен склад.
        employee = attrs.get("employee")
        equipment = attrs.get("equipment")
        if employee and equipment:
            raise serializers.ValidationError(
                {"equipment": "SIM нельзя одновременно закрепить за сотрудником и за оборудованием."}
            )
        # Обязательность склада при создании свободной SIM — на стороне формы.
        storage = attrs.get("storage_place")
        if storage is not None and storage.place_type != Place.PlaceType.STORAGE:
            raise serializers.ValidationError({"storage_place": "Выберите место хранения (склад)."})
        return attrs


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
    # Места-объекты доступа: выбрать можно только места с флагом requires_pass.
    places = PlaceMiniSerializer(many=True, read_only=True)
    place_ids = serializers.PrimaryKeyRelatedField(
        source="places",
        queryset=Place.objects.filter(is_archived=False, requires_pass=True),
        many=True,
        write_only=True,
        required=False,
    )
    is_deactivated = serializers.BooleanField(read_only=True)
    object_type_display = serializers.CharField(source="get_object_type_display", read_only=True)
    utilization_reason_display = serializers.CharField(source="get_utilization_reason_display", read_only=True)
    employee_name = serializers.SerializerMethodField()
    # Размещение (B8): свободный пропуск/ключ лежит на складе (место хранения).
    storage_place_detail = serializers.SerializerMethodField()
    # Явно — чтобы уникальность непустого номера проверялась своим сообщением.
    account_number = serializers.CharField(max_length=64, required=False, allow_blank=True)

    class Meta:
        model = AccessPass
        fields = [
            "id",
            "object_type",
            "object_type_display",
            "employee",
            "employee_name",
            "account_number",
            "type_vehicle",
            "type_pedestrian",
            "buildings",
            "building_ids",
            "rooms",
            "room_ids",
            "places",
            "place_ids",
            "storage_place",
            "storage_place_detail",
            "is_deactivated",
            "is_utilized",
            "utilized_at",
            "utilization_reason",
            "utilization_reason_display",
            "created_at",
        ]
        # employee можно задать при создании (сразу привязать) или через
        # action attach/detach; статусы утилизации — read-only (только action
        # utilize).
        read_only_fields = ["created_at", "is_utilized", "utilized_at", "utilization_reason"]
        # Уникальность учётного номера проверяем вручную в validate() — в разрезе
        # object_type и только среди непустых (B1). Иначе DRF из составного
        # UniqueConstraint (object_type, account_number) автоматически добавил бы
        # UniqueTogetherValidator, который делает account_number обязательным и
        # отдаёт ошибку в non_field_errors — оба поведения нам не нужны.
        validators = []

    def get_employee_name(self, obj):
        return str(obj.employee) if obj.employee_id else None

    def get_storage_place_detail(self, obj):
        return place_detail(obj.storage_place) if obj.storage_place_id else None

    def validate_account_number(self, value):
        # Уникальность проверяется в validate() — там уже известен object_type
        # (номера пропусков и ключей независимы, см. B1).
        return value.strip()

    def validate(self, attrs):
        # Каждое выбранное помещение должно принадлежать одному из выбранных зданий.
        buildings = attrs.get("buildings")
        if buildings is None:
            buildings = list(self.instance.buildings.all()) if self.instance else []
        rooms = attrs.get("rooms")
        if rooms is None:
            rooms = list(self.instance.rooms.all()) if self.instance else []
        places = attrs.get("places")
        if places is None:
            places = list(self.instance.places.all()) if self.instance else []
        building_ids = {b.id for b in buildings}
        if rooms and any(r.building_id not in building_ids for r in rooms):
            raise serializers.ValidationError(
                {"room_ids": "Помещения должны относиться к выбранным зданиям."}
            )
        # Место должно относиться к одному из выбранных зданий (через своё помещение).
        if places and any(p.room.building_id not in building_ids for p in places):
            raise serializers.ValidationError(
                {"place_ids": "Места должны относиться к выбранным зданиям."}
            )

        # Ключ — строго один объект доступа: одно здание ИЛИ одно помещение ИЛИ
        # одно место. Название у ключа не используется.
        object_type = attrs.get("object_type")
        if object_type is None:
            object_type = self.instance.object_type if self.instance else AccessPass.ObjectType.PASS

        # Уникальность учётного номера — в разрезе типа объекта и только среди
        # непустых (пропуска и ключи не конфликтуют между собой, см. B1).
        account_number = attrs.get("account_number")
        if account_number is None and self.instance:
            account_number = self.instance.account_number
        if account_number:
            qs = AccessPass.objects.filter(object_type=object_type, account_number=account_number)
            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                label = "Ключ" if object_type == AccessPass.ObjectType.KEY else "Пропуск"
                raise serializers.ValidationError(
                    {"account_number": f"{label} с таким учётным номером уже есть."}
                )

        if object_type == AccessPass.ObjectType.KEY:
            if len(buildings) != 1:
                raise serializers.ValidationError(
                    {"building_ids": "У ключа должно быть выбрано ровно одно здание."}
                )
            if len(rooms) + len(places) > 1:
                raise serializers.ValidationError(
                    {"room_ids": "У ключа можно выбрать только один объект: помещение или место."}
                )

        # Размещение (B8): свободный (без сотрудника) пропуск/ключ лежит на складе.
        # Обязательность выбора склада при создании — на стороне формы.
        storage = attrs.get("storage_place")
        if storage is not None and storage.place_type != Place.PlaceType.STORAGE:
            raise serializers.ValidationError({"storage_place": "Выберите место хранения (склад)."})
        return attrs


# Списанное (архивное) Оборудование не считается закреплённым за Сотрудником —
# в списке/карточке и в счётчике показываем только активное .
def _active_equipment(employee):
    return [eq for eq in employee.equipment.all() if not eq.is_written_off]


# Закреплённые за сотрудником инструменты (количественные): за ним может числиться
# часть единиц; списанные карточки закреплений не имеют.
def _tool_entries(employee):
    from tools.models import ToolAllocation

    allocs = (
        ToolAllocation.objects.filter(employee=employee, tool__is_written_off=False)
        .select_related("tool")
        .order_by("tool__name")
    )
    return [{"id": a.tool_id, "name": a.tool.name, "quantity": a.quantity} for a in allocs]


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
    tools = serializers.SerializerMethodField()
    sim_cards = serializers.SerializerMethodField()
    passes = serializers.SerializerMethodField()
    workplaces = serializers.SerializerMethodField()
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
            "tools",
            "sim_cards",
            "passes",
            "workplaces",
            "user_email",
        ]
        read_only_fields = ["is_employed"]

    def get_full_name(self, obj):
        return str(obj)

    def get_equipment(self, obj):
        return EquipmentMiniSerializer(_active_equipment(obj), many=True).data

    def get_tools(self, obj):
        # Закреплённые за сотрудником инструменты (строкой «Название · N шт.»).
        return _tool_entries(obj)

    def get_sim_cards(self, obj):
        # Показываем и активные, и деактивированные (для истории). Порядок —
        # из Meta.ordering модели: активные выше архивных.
        return SimCardSerializer(obj.sim_cards.all(), many=True).data

    def get_passes(self, obj):
        # И активные, и деактивированные пропуска (для истории).
        return AccessPassSerializer(obj.passes.all(), many=True).data

    def get_workplaces(self, obj):
        # Рабочие места, за которыми закреплён сотрудник (не архивные), с
        # перечнем объектов, стоящих на каждом месте (оборудование, инструменты).
        result = []
        for p in obj.workplaces.filter(is_archived=False).select_related("room__building"):
            equipment = [eq for eq in p.equipment.all() if not eq.is_written_off]
            tools = [
                {"id": a.tool_id, "name": a.tool.name, "quantity": a.quantity}
                for a in p.tool_allocations.all()
                if a.place_id == p.id and not a.tool.is_written_off
            ]
            result.append({
                "id": p.id,
                "name": p.name,
                "location": f"{p.room.building.name} — {p.room.name}",
                "equipment": EquipmentMiniSerializer(equipment, many=True).data,
                "tools": tools,
            })
        return result

    def get_user_email(self, obj):
        return obj.user.email if hasattr(obj, "user") else None
