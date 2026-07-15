from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from core.permissions import IsAdminOrAccountant

from . import service
from .models import Building, Place, Room
from .serializers import BuildingSerializer, PlaceSerializer, RoomSerializer

# Раздел «Помещения» — справочник зданий/помещений/мест. Управление и
# просмотр только admin/accountant. Физического удаления нет: сущности
# архивируются (каскадно вниз), поэтому destroy заблокирован во всех вьюхах.
_NO_DELETE = {"detail": "Удаление недоступно — используйте архивирование."}


class _NoDeleteViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAdminOrAccountant]
    pagination_class = None

    def destroy(self, request, *args, **kwargs):
        return Response(_NO_DELETE, status=405)


class BuildingViewSet(_NoDeleteViewSet):
    serializer_class = BuildingSerializer

    def get_queryset(self):
        qs = Building.objects.all().prefetch_related("rooms__places")
        # Список слева: по умолчанию только активные; ?include_archived=1
        # подмешивает архивные (детали здания открываются всегда).
        if self.action == "list" and self.request.query_params.get("include_archived") not in ("1", "true"):
            qs = qs.filter(is_archived=False)
        return qs

    @action(detail=True, methods=["post"])
    def archive(self, request, pk=None):
        building = self.get_object()
        service.archive_building(building)
        return Response(BuildingSerializer(building).data)

    @action(detail=True, methods=["post"])
    def unarchive(self, request, pk=None):
        building = self.get_object()
        service.unarchive(building)
        return Response(BuildingSerializer(building).data)


class RoomViewSet(_NoDeleteViewSet):
    serializer_class = RoomSerializer

    def get_queryset(self):
        return Room.objects.all().prefetch_related("places")

    @action(detail=True, methods=["post"])
    def archive(self, request, pk=None):
        room = self.get_object()
        service.archive_room(room)
        return Response(RoomSerializer(room).data)

    @action(detail=True, methods=["post"])
    def unarchive(self, request, pk=None):
        room = self.get_object()
        if room.building.is_archived:
            return Response(
                {"detail": "Нельзя вернуть помещение из архива, пока его здание в архиве."}, status=409
            )
        service.unarchive(room)
        return Response(RoomSerializer(room).data)


class PlaceViewSet(_NoDeleteViewSet):
    serializer_class = PlaceSerializer

    def get_queryset(self):
        return Place.objects.all()

    @action(detail=True, methods=["post"])
    def archive(self, request, pk=None):
        place = self.get_object()
        service.archive_place(place)
        return Response(PlaceSerializer(place).data)

    @action(detail=True, methods=["post"])
    def unarchive(self, request, pk=None):
        place = self.get_object()
        if place.room.is_archived:
            return Response(
                {"detail": "Нельзя вернуть место из архива, пока его помещение в архиве."}, status=409
            )
        service.unarchive(place)
        return Response(PlaceSerializer(place).data)
