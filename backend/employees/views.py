from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import filters, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import BasePermission
from rest_framework.response import Response
from rest_framework.views import APIView

from core.pagination import ELECursorPagination
from core.permissions import AccessPassAccessPermission, IsAdminOrAccountant, SimCardAccessPermission
from storage.service import delete_stored_file, store_uploaded_file
from storage.validators import validate_image_max_dimensions

from .models import AccessPass, Employee, SimCard
from .serializers import (
    AccessPassSerializer,
    EmployeeListSerializer,
    EmployeeSerializer,
    SimCardSerializer,
)


class EmployeeViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAdminOrAccountant]
    pagination_class = ELECursorPagination
    filter_backends = [filters.OrderingFilter]
    ordering_fields = ["last_name"]
    ordering = ["last_name", "first_name"]  # по умолчанию — по ФИО, А→Я

    def get_serializer_class(self):
        return EmployeeListSerializer if self.action == "list" else EmployeeSerializer

    def get_queryset(self):
        qs = Employee.objects.all().prefetch_related(
            "equipment__equipment_type",
            "equipment__field_values__field",
            "sim_cards",
            "passes__buildings",
            "passes__rooms",
        )
        search = self.request.query_params.get("search")
        if search:
            # Поиск по Имени, Фамилии и Должности.
            qs = qs.filter(
                Q(first_name__icontains=search)
                | Q(last_name__icontains=search)
                | Q(position__icontains=search)
            )
        return qs

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.equipment.exists():
            return Response({"detail": "Нельзя удалить сотрудника — за ним закреплено оборудование."}, status=409)
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=["post"])
    def terminate(self, request, pk=None):
        """Увольнение (E3): отвязывает всё оборудование, деактивирует
        выданные SIM-карты и пропуска (для истории остаются в карточке),
        опционально деактивирует связанного Пользователя."""
        employee = self.get_object()
        equipment_list = list(employee.equipment.all())
        for eq in equipment_list:
            # По одной, не bulk .update() — иначе не сработает история.
            eq.employee = None
            eq.save(update_fields=["employee"])

        now = timezone.now()

        # SIM-карты не открепляем (номер не передаётся другому) — помечаем
        # деактивированными, чтобы напомнить оператору погасить их у поставщика.
        active_sims = list(employee.sim_cards.filter(is_deactivated=False))
        for sim in active_sims:
            sim.is_deactivated = True
            sim.deactivated_at = now
            sim.save(update_fields=["is_deactivated", "deactivated_at"])

        # Пропуска тоже не открепляем — деактивируем (напоминание отключить
        # карту в СКУД), но оставляем закреплёнными для истории.
        active_passes = list(employee.passes.filter(is_deactivated=False))
        for ap in active_passes:
            ap.is_deactivated = True
            ap.deactivated_at = now
            ap.save(update_fields=["is_deactivated", "deactivated_at"])

        employee.is_employed = False
        employee.save(update_fields=["is_employed"])

        deactivated_user = False
        if request.data.get("deactivate_user") and hasattr(employee, "user"):
            user = employee.user
            user.is_active = False
            user.save(update_fields=["is_active"])
            deactivated_user = True

        data = EmployeeSerializer(employee).data
        data["detached_equipment_count"] = len(equipment_list)
        data["deactivated_sim_count"] = len(active_sims)
        data["deactivated_pass_count"] = len(active_passes)
        data["deactivated_user"] = deactivated_user
        return Response(data)

    @action(detail=False, methods=["get"])
    def departments(self, request):
        # Автоподсказка по уже встречавшимся значениям — без отдельного справочника.
        values = (
            Employee.objects.exclude(department="")
            .values_list("department", flat=True)
            .distinct()
            .order_by("department")
        )
        return Response(list(values))


class SimCardViewSet(viewsets.ModelViewSet):
    """Корпоративные SIM/E-SIM сотрудников. Управление — из карточки Сотрудника
    (admin/accountant); Сотрудник (в т.ч. Наблюдатель) видит только свои номера
    в Профиле (read-only). В отличие от Оборудования, у SIM нет страницы-списка,
    поэтому «Наблюдатель видит всё» здесь не действует. См. SimCardAccessPermission."""

    permission_classes = [SimCardAccessPermission]
    serializer_class = SimCardSerializer
    pagination_class = None

    def get_queryset(self):
        qs = SimCard.objects.all()
        user = self.request.user
        if user.role == "employee":
            # Только свои номера (Наблюдатель не расширяет доступ к SIM);
            # не привязан к Сотруднику — не видит ничего.
            return qs.filter(employee_id=user.employee_id) if user.employee_id else qs.none()
        employee = self.request.query_params.get("employee")
        if employee:
            qs = qs.filter(employee_id=employee)
        return qs

    @action(detail=True, methods=["post"], permission_classes=[IsAdminOrAccountant])
    def deactivate(self, request, pk=None):
        """Деактивация номера (архив). Симка остаётся в карточке для истории."""
        sim = self.get_object()
        if not sim.is_deactivated:
            sim.is_deactivated = True
            sim.deactivated_at = timezone.now()
            sim.save(update_fields=["is_deactivated", "deactivated_at"])
        return Response(SimCardSerializer(sim).data)

    @action(detail=False, methods=["get"], permission_classes=[IsAdminOrAccountant])
    def operators(self, request):
        # Автоподсказка «Оператор» — без отдельного справочника, как departments.
        values = (
            SimCard.objects.exclude(network_operator="")
            .values_list("network_operator", flat=True)
            .distinct()
            .order_by("network_operator")
        )
        return Response(list(values))

    @action(detail=False, methods=["get"], permission_classes=[IsAdminOrAccountant])
    def providers(self, request):
        # Автоподсказка «Поставщик».
        values = (
            SimCard.objects.exclude(provider="")
            .values_list("provider", flat=True)
            .distinct()
            .order_by("provider")
        )
        return Response(list(values))


class AccessPassViewSet(viewsets.ModelViewSet):
    """Пропуска СКУД сотрудников. Управление — из карточки Сотрудника
    (admin/accountant); Сотрудник видит только свои пропуска в Профиле
    (read-only). Механика 1:1 как у SimCardViewSet. См. AccessPassAccessPermission."""

    permission_classes = [AccessPassAccessPermission]
    serializer_class = AccessPassSerializer
    pagination_class = None

    def get_queryset(self):
        qs = AccessPass.objects.all().prefetch_related("buildings", "rooms")
        user = self.request.user
        if user.role == "employee":
            # Только свои пропуска; не привязан к Сотруднику — не видит ничего.
            return qs.filter(employee_id=user.employee_id) if user.employee_id else qs.none()
        employee = self.request.query_params.get("employee")
        if employee:
            qs = qs.filter(employee_id=employee)
        return qs

    @action(detail=True, methods=["post"], permission_classes=[IsAdminOrAccountant])
    def deactivate(self, request, pk=None):
        """Деактивация пропуска (архив). Остаётся в карточке для истории."""
        access_pass = self.get_object()
        if not access_pass.is_deactivated:
            access_pass.is_deactivated = True
            access_pass.deactivated_at = timezone.now()
            access_pass.save(update_fields=["is_deactivated", "deactivated_at"])
        return Response(AccessPassSerializer(access_pass).data)


class _CanEditAvatar(BasePermission):
    """Аватар грузит либо Admin/Accountant из карточки Сотрудника, либо сам
    пользователь из своего Профиля — по совпадению employee_id."""

    def has_permission(self, request, view):
        user = request.user
        if not user.is_authenticated:
            return False
        if user.role in ("admin", "accountant"):
            return True
        return user.employee_id is not None and user.employee_id == view.kwargs.get("employee_pk")


class EmployeeAvatarUploadView(APIView):
    """Аватар Сотрудника — не более 600×600px, не более 2 МБ.
    Отдельный multipart-эндпоинт, как и Company.logo — сериализатор
    карточки Сотрудника отдаёт avatar только на чтение."""

    permission_classes = [_CanEditAvatar]

    def post(self, request, employee_pk):
        employee = get_object_or_404(Employee, pk=employee_pk)
        file_obj = request.FILES.get("file")
        if not file_obj:
            return Response({"detail": "Файл не передан."}, status=400)
        if file_obj.size > 2 * 1024 * 1024:
            return Response({"detail": "Файл больше 2 МБ."}, status=400)
        try:
            validate_image_max_dimensions(file_obj, 600, 600)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=400)

        old_avatar = employee.avatar
        employee.avatar = store_uploaded_file(file_obj, "employees/avatars")
        employee.save(update_fields=["avatar"])
        delete_stored_file(old_avatar)
        return Response(EmployeeSerializer(employee).data)

    def delete(self, request, employee_pk):
        employee = get_object_or_404(Employee, pk=employee_pk)
        old_avatar = employee.avatar
        employee.avatar = None
        employee.save(update_fields=["avatar"])
        delete_stored_file(old_avatar)
        return Response(status=204)
