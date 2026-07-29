"""Эндпоинты отчётов B45 (только чтение, Администратор/Ответственный за учёт).

Фильтры у каждого отчёта свои; не заданы — отдаётся всё. Пустые места
включаются в отчёты по местам/парковкам."""

from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.permissions import IsAdminOrAccountant
from locations.models import Place

from .builders import build_employees_report, build_parking_report, build_places_report


def _int(request, key):
    value = request.query_params.get(key)
    if value in (None, ""):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


class PlacesReportView(APIView):
    """Отчёт по местам: рабочие места / МОП / места хранения.

    ?kind=workplace|common|storage (по умолчанию workplace),
    ?building=&room=&place= — фильтры (здания/помещения/места этого типа)."""

    permission_classes = [IsAuthenticated, IsAdminOrAccountant]

    def get(self, request):
        kind = request.query_params.get("kind") or Place.PlaceType.WORKPLACE
        if kind not in (Place.PlaceType.WORKPLACE, Place.PlaceType.COMMON, Place.PlaceType.STORAGE):
            return Response({"detail": "Неизвестный тип отчёта."}, status=400)
        data = build_places_report(
            kind,
            building_id=_int(request, "building"),
            room_id=_int(request, "room"),
            place_id=_int(request, "place"),
        )
        return Response({"kind": kind, "buildings": data})


class ParkingReportView(APIView):
    """Отчёт по парковкам: парковочные места с увязкой к зданию/помещению,
    за каждым — сотрудник (личное авто) или транспорт компании.

    ?building=&room=&place= — фильтры (здания / помещения-парковки / места)."""

    permission_classes = [IsAuthenticated, IsAdminOrAccountant]

    def get(self, request):
        data = build_parking_report(
            building_id=_int(request, "building"),
            room_id=_int(request, "room"),
            place_id=_int(request, "place"),
        )
        return Response({"buildings": data})


class EmployeesReportView(APIView):
    """Отчёт по имуществу у сотрудников: закреплённое имущество + рабочие места
    сотрудника с имуществом на них.

    ?employee= — фильтр по конкретному сотруднику."""

    permission_classes = [IsAuthenticated, IsAdminOrAccountant]

    def get(self, request):
        data = build_employees_report(employee_id=_int(request, "employee"))
        return Response({"employees": data})
