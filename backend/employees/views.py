from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import filters, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import BasePermission
from rest_framework.response import Response
from rest_framework.views import APIView

from core.pagination import ELECursorPagination
from core.permissions import IsAdminOrAccountant
from storage.service import delete_stored_file, store_uploaded_file
from storage.validators import validate_image_max_dimensions

from .models import Employee
from .serializers import EmployeeListSerializer, EmployeeSerializer


class EmployeeViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAdminOrAccountant]
    pagination_class = ELECursorPagination
    filter_backends = [filters.OrderingFilter]
    ordering_fields = ["last_name"]
    ordering = ["last_name", "first_name"]  # по умолчанию — по ФИО, А→Я (§5.3)

    def get_serializer_class(self):
        return EmployeeListSerializer if self.action == "list" else EmployeeSerializer

    def get_queryset(self):
        qs = Employee.objects.all().prefetch_related("equipment__equipment_type", "equipment__field_values__field")
        search = self.request.query_params.get("search")
        if search:
            qs = qs.filter(Q(first_name__icontains=search) | Q(last_name__icontains=search))
        return qs

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.equipment.exists():
            return Response({"detail": "Нельзя удалить сотрудника — за ним закреплено оборудование."}, status=409)
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=["post"])
    def terminate(self, request, pk=None):
        """Увольнение (§5.3, E3): отвязывает всё оборудование, опционально
        деактивирует связанного Пользователя."""
        employee = self.get_object()
        equipment_list = list(employee.equipment.all())
        for eq in equipment_list:
            # По одной, не bulk .update() — иначе не сработает история (§5.8).
            eq.employee = None
            eq.save(update_fields=["employee"])

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
        data["deactivated_user"] = deactivated_user
        return Response(data)

    @action(detail=False, methods=["get"])
    def departments(self, request):
        # Автоподсказка по уже встречавшимся значениям (§3.3) — без отдельного справочника.
        values = (
            Employee.objects.exclude(department="")
            .values_list("department", flat=True)
            .distinct()
            .order_by("department")
        )
        return Response(list(values))


class _CanEditAvatar(BasePermission):
    """Аватар грузит либо Admin/Accountant из карточки Сотрудника, либо сам
    пользователь из своего Профиля (§3.3) — по совпадению employee_id."""

    def has_permission(self, request, view):
        user = request.user
        if not user.is_authenticated:
            return False
        if user.role in ("admin", "accountant"):
            return True
        return user.employee_id is not None and user.employee_id == view.kwargs.get("employee_pk")


class EmployeeAvatarUploadView(APIView):
    """Аватар Сотрудника (ТЗ §3.3) — не более 600×600px, не более 2 МБ.
    Отдельный multipart-эндпоинт, как и Company.logo (§8.3) — сериализатор
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
