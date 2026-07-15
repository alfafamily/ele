from rest_framework import serializers

from .models import Building, Place, Room
from .sorting import room_sort_key


class PlaceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Place
        fields = ["id", "room", "name", "is_archived"]
        # Архивирование — только через отдельный action, не записью поля.
        read_only_fields = ["is_archived"]

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Укажите название/номер места.")
        return value


class RoomSerializer(serializers.ModelSerializer):
    # Места отдаём вложенно (и активные, и архивные — для истории), по названию.
    places = serializers.SerializerMethodField()

    class Meta:
        model = Room
        fields = ["id", "building", "name", "floor", "is_archived", "places"]
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
        fields = ["id", "name", "address", "floor_count", "is_archived", "room_count", "rooms"]
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
