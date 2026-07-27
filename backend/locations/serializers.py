from rest_framework import serializers

from employees.models import Employee
from storage.serializers import StoredFileSerializer
from transport.models import Transport
from transport.serializers import TransportMiniSerializer

from .models import Building, Place, Room
from .sorting import room_sort_key


class PlaceSerializer(serializers.ModelSerializer):
    # Сотрудники — принимаем список id, отдаём ещё и краткие данные для показа.
    # Для рабочего места — закреплённые сотрудники; для парковочного места —
    # владельцы личных авто («Личный авто»).
    employees = serializers.PrimaryKeyRelatedField(
        many=True, required=False, queryset=Employee.objects.all(),
    )
    employees_detail = serializers.SerializerMethodField()
    # Транспорт компании на парковочном месте («Транспорт компании»).
    transport = serializers.PrimaryKeyRelatedField(
        many=True, required=False, queryset=Transport.objects.all(),
    )
    transport_detail = serializers.SerializerMethodField()
    # Контекст для пикеров размещения (плоский список мест).
    room_name = serializers.CharField(source="room.name", read_only=True)
    building = serializers.IntegerField(source="room.building_id", read_only=True)
    building_name = serializers.CharField(source="room.building.name", read_only=True)

    class Meta:
        model = Place
        fields = [
            "id", "room", "room_name", "building", "building_name", "name",
            "place_type", "employees", "employees_detail", "transport", "transport_detail",
            "requires_pass", "is_archived",
        ]
        # Архивирование — только через отдельный action, не записью поля.
        read_only_fields = ["is_archived"]

    def get_employees_detail(self, obj):
        return [
            {
                "id": e.id,
                "name": f"{e.last_name} {e.first_name}".strip(),
                "avatar": StoredFileSerializer(e.avatar).data if e.avatar_id else None,
            }
            for e in obj.employees.all()
        ]

    def get_transport_detail(self, obj):
        return TransportMiniSerializer(obj.transport.all(), many=True).data

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Укажите название/номер места.")
        return value

    def validate(self, attrs):
        place_type = attrs.get("place_type", getattr(self.instance, "place_type", None))
        room = attrs.get("room", getattr(self.instance, "room", None))
        # Тип места должен соответствовать помещению: парковочные места — только
        # в помещениях-парковках, рабочие места/склады — только в обычных.
        if room is not None:
            if place_type == Place.PlaceType.PARKING_SPOT and not room.is_parking:
                raise serializers.ValidationError(
                    {"place_type": "Парковочные места создаются только в помещениях-парковках."}
                )
            if place_type != Place.PlaceType.PARKING_SPOT and room.is_parking:
                raise serializers.ValidationError(
                    {"place_type": "В помещении-парковке можно создавать только парковочные места."}
                )

        # Значения m2m: если в запросе не переданы — берём из существующего объекта.
        def current(field):
            if field in attrs:
                return attrs[field]
            return list(getattr(self.instance, field).all()) if self.instance else []

        employees = current("employees")
        transport = current("transport")

        if place_type == Place.PlaceType.WORKPLACE:
            if transport:
                raise serializers.ValidationError(
                    {"transport": "Транспорт закрепляется только за парковочным местом."}
                )
        elif place_type == Place.PlaceType.PARKING_SPOT:
            if employees and transport:
                raise serializers.ValidationError(
                    "Парковочное место — либо личные авто сотрудников, либо транспорт компании, "
                    "но не то и другое вместе."
                )
            # Один транспорт — одно парковочное место: нельзя закрепить транспорт,
            # уже стоящий на другом (не архивном) месте.
            for t in transport:
                other = Place.objects.filter(
                    place_type=Place.PlaceType.PARKING_SPOT, is_archived=False, transport=t
                )
                if self.instance:
                    other = other.exclude(pk=self.instance.pk)
                if other.exists():
                    raise serializers.ValidationError(
                        {"transport": f"«{t.inventory_number}» уже закреплён за другим парковочным местом."}
                    )
        else:  # storage
            if employees:
                raise serializers.ValidationError(
                    {"employees": "Сотрудников можно закреплять за рабочим или парковочным местом."}
                )
            if transport:
                raise serializers.ValidationError(
                    {"transport": "Транспорт закрепляется только за парковочным местом."}
                )
        return attrs


class RoomSerializer(serializers.ModelSerializer):
    # Места отдаём вложенно (и активные, и архивные — для истории), по названию.
    places = serializers.SerializerMethodField()
    plan_file = StoredFileSerializer(read_only=True)
    is_parking = serializers.BooleanField(read_only=True)

    class Meta:
        model = Room
        fields = [
            "id", "building", "name", "floor", "parking_type", "is_parking",
            "plan_file", "requires_pass", "is_archived", "places",
        ]
        # Архивирование и план (отдельный upload-эндпоинт) — read-only.
        read_only_fields = ["is_archived", "plan_file"]
        # Уникальность (building, floor) — условная (только этаж-парковки), поэтому
        # авто-валидатор DRF снят: иначе он запрещал бы обычным помещениям одного
        # здания делить номер этажа. Условие проверяется вручную в validate().
        validators = []

    def get_places(self, obj):
        places = sorted(obj.places.all(), key=lambda p: (p.name or "").lower())
        return PlaceSerializer(places, many=True).data

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Укажите название/номер помещения.")
        return value

    def validate(self, attrs):
        parking_type = attrs.get("parking_type", getattr(self.instance, "parking_type", ""))
        floor = attrs.get("floor", getattr(self.instance, "floor", "") or "")
        building = attrs.get("building", getattr(self.instance, "building", None))
        if parking_type == Room.ParkingType.ADJACENT:
            # У прилегающей парковки этажа нет — она снаружи здания.
            attrs["floor"] = ""
        elif parking_type == Room.ParkingType.FLOOR:
            floor = floor.strip()
            if not floor:
                raise serializers.ValidationError({"floor": "Для этаж-парковки укажите номер этажа."})
            attrs["floor"] = floor
            # Этаж уникален среди этаж-парковок здания.
            dupes = Room.objects.filter(
                building=building, parking_type=Room.ParkingType.FLOOR, floor=floor
            )
            if self.instance:
                dupes = dupes.exclude(pk=self.instance.pk)
            if dupes.exists():
                raise serializers.ValidationError(
                    {"floor": "Этаж-парковка с таким этажом уже есть в этом здании."}
                )
        return attrs


class BuildingSerializer(serializers.ModelSerializer):
    # Полное дерево одним ответом — помещения отсортированы по этажу
    # (см. sorting.room_sort_key), внутри — места.
    rooms = serializers.SerializerMethodField()
    room_count = serializers.SerializerMethodField()

    class Meta:
        model = Building
        fields = ["id", "name", "address", "floor_count", "requires_pass", "is_archived", "room_count", "rooms"]
        read_only_fields = ["is_archived"]

    def get_rooms(self, obj):
        rooms = sorted(obj.rooms.all(), key=room_sort_key)
        return RoomSerializer(rooms, many=True).data

    def get_room_count(self, obj):
        return sum(1 for r in obj.rooms.all() if not r.is_archived)

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Укажите наименование здания.")
        return value


class BuildingMiniSerializer(serializers.ModelSerializer):
    """Здание в карточке пропуска — без вложенного дерева."""

    class Meta:
        model = Building
        fields = ["id", "name", "address", "is_archived"]


class RoomMiniSerializer(serializers.ModelSerializer):
    """Помещение в карточке пропуска (building — для группировки по зданиям)."""

    class Meta:
        model = Room
        fields = ["id", "building", "name", "floor", "is_archived"]


class PlaceMiniSerializer(serializers.ModelSerializer):
    """Место в карточке пропуска (room/building — для группировки, room_name —
    чтобы показывать «здание — помещение» для объекта-места)."""

    building = serializers.IntegerField(source="room.building_id", read_only=True)
    room_name = serializers.CharField(source="room.name", read_only=True)

    class Meta:
        model = Place
        fields = ["id", "room", "room_name", "building", "name", "place_type", "is_archived"]
