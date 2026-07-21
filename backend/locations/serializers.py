from rest_framework import serializers

from employees.models import Employee
from storage.serializers import StoredFileSerializer

from .models import Building, Place, Room
from .sorting import room_sort_key


class PlaceSerializer(serializers.ModelSerializer):
    # Сотрудники за рабочим местом (несколько) — принимаем список id, отдаём
    # ещё и краткие данные для отображения. Осмысленно для place_type=workplace.
    employees = serializers.PrimaryKeyRelatedField(
        many=True, required=False, queryset=Employee.objects.all(),
    )
    employees_detail = serializers.SerializerMethodField()
    # Контекст для пикеров размещения (плоский список мест).
    room_name = serializers.CharField(source="room.name", read_only=True)
    building = serializers.IntegerField(source="room.building_id", read_only=True)
    building_name = serializers.CharField(source="room.building.name", read_only=True)

    class Meta:
        model = Place
        fields = [
            "id", "room", "room_name", "building", "building_name", "name",
            "place_type", "employees", "employees_detail", "requires_pass", "is_archived",
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

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Укажите название/номер места.")
        return value

    def validate(self, attrs):
        # Сотрудников закрепляем только за рабочим местом.
        place_type = attrs.get("place_type", getattr(self.instance, "place_type", None))
        employees = attrs.get("employees")
        if employees and place_type != Place.PlaceType.WORKPLACE:
            raise serializers.ValidationError(
                {"employees": "Сотрудников можно закреплять только за рабочим местом."}
            )
        return attrs


class RoomSerializer(serializers.ModelSerializer):
    # Места отдаём вложенно (и активные, и архивные — для истории), по названию.
    places = serializers.SerializerMethodField()

    class Meta:
        model = Room
        fields = ["id", "building", "name", "floor", "requires_pass", "is_archived", "places"]
        read_only_fields = ["is_archived"]

    def get_places(self, obj):
        places = sorted(obj.places.all(), key=lambda p: (p.name or "").lower())
        return PlaceSerializer(places, many=True).data

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Укажите название/номер помещения.")
        return value


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
