from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from core.permissions import IsAdminOrAccountantOrReadOnlyObserver

from . import service
from .models import Building, Place, Room
from .serializers import BuildingSerializer, PlaceSerializer, RoomSerializer

# Раздел «Помещения» — справочник зданий/помещений/мест. Управление —
# admin/accountant; Наблюдатель видит справочник на просмотр. Физического
# удаления нет: сущности архивируются (каскадно вниз), destroy заблокирован.
_NO_DELETE = {"detail": "Удаление недоступно — используйте архивирование."}


class _NoDeleteViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAdminOrAccountantOrReadOnlyObserver]
    pagination_class = None

    def destroy(self, request, *args, **kwargs):
        return Response(_NO_DELETE, status=405)


class BuildingViewSet(_NoDeleteViewSet):
    serializer_class = BuildingSerializer

    def get_queryset(self):
        qs = Building.objects.all().prefetch_related("rooms__places__employees__avatar")
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
        qs = Place.objects.select_related("room__building").prefetch_related("employees__avatar")
        # Плоский список мест для пикеров размещения: ?place_type=storage|workplace,
        # ?active=1 — только не архивные.
        place_type = self.request.query_params.get("place_type")
        if place_type in (Place.PlaceType.STORAGE, Place.PlaceType.WORKPLACE):
            qs = qs.filter(place_type=place_type)
        if self.request.query_params.get("active") in ("1", "true"):
            qs = qs.filter(is_archived=False)

        # B27. Опции «Размещение → Место хранения/Рабочее место» в фильтрах:
        # только места, где реально стоит объект выбранных типов.
        from core.eav_filters import csv_ids

        eq_types = csv_ids(self.request.query_params.get("has_equipment_type"))
        if eq_types:
            qs = qs.filter(
                equipment__equipment_type_id__in=eq_types, equipment__is_written_off=False
            ).distinct()
        lic_types = csv_ids(self.request.query_params.get("has_license_type"))
        if lic_types:
            from licenses.models import License

            qs = qs.filter(
                id__in=License.objects.filter(
                    license_type_id__in=lic_types, is_retired=False, storage_place__isnull=False
                ).values("storage_place")
            )
        # B27. Опции «Размещение → Место хранения» в фильтре Корп.связи: только
        # склады, где лежит SIM, подходящая под верхние фильтры.
        if self.request.query_params.get("has_sim") == "1":
            from django.db.models import Exists, OuterRef
            from employees.models import SimCard
            from employees.views import sim_match_filter

            sub = sim_match_filter(
                SimCard.objects.filter(storage_place=OuterRef("pk"), is_utilized=False),
                self.request.query_params,
            )
            qs = qs.filter(Exists(sub))
        # B27. Опции «Размещение → Место хранения» в фильтре Средств доступа.
        if self.request.query_params.get("has_pass") == "1":
            from django.db.models import Exists, OuterRef
            from employees.models import AccessPass
            from employees.views import pass_match_filter

            sub = pass_match_filter(
                AccessPass.objects.filter(storage_place=OuterRef("pk"), is_utilized=False),
                self.request.query_params,
            )
            qs = qs.filter(Exists(sub))
        return qs

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
