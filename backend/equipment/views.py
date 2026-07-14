from django.db.models import ProtectedError, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import filters, generics, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from core.eav import count_missing_for_field
from core.pagination import ELECursorPagination
from core.permissions import EquipmentAccessPermission, IsAdminOrAccountant
from employees.models import Employee
from storage.service import delete_stored_file, store_uploaded_file

from .models import Equipment, EquipmentCustomField, EquipmentFieldValue, EquipmentType, EquipmentTypeField
from .serializers import (
    EquipmentFieldValueOutSerializer,
    EquipmentSerializer,
    EquipmentTypeFieldSerializer,
    EquipmentTypeSerializer,
)


class EquipmentTypeViewSet(viewsets.ModelViewSet):
    queryset = EquipmentType.objects.all().order_by("name")
    serializer_class = EquipmentTypeSerializer
    permission_classes = [IsAdminOrAccountant]

    def destroy(self, request, *args, **kwargs):
        try:
            return super().destroy(request, *args, **kwargs)
        except ProtectedError:
            return Response(
                {"detail": "Нельзя удалить Тип — к нему привязаны объекты. Доступно архивирование."}, status=409
            )


class EquipmentTypeFieldListView(generics.ListCreateAPIView):
    serializer_class = EquipmentTypeFieldSerializer
    permission_classes = [IsAdminOrAccountant]

    def get_queryset(self):
        return EquipmentTypeField.objects.filter(equipment_type_id=self.kwargs["type_pk"])

    def perform_create(self, serializer):
        equipment_type = get_object_or_404(EquipmentType, pk=self.kwargs["type_pk"])
        serializer.save(equipment_type=equipment_type)


class EquipmentTypeFieldDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = EquipmentTypeFieldSerializer
    permission_classes = [IsAdminOrAccountant]

    def get_queryset(self):
        return EquipmentTypeField.objects.filter(equipment_type_id=self.kwargs["type_pk"])

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.is_locked:
            return Response({"detail": "Базовый реквизит «Модель» нельзя удалить."}, status=409)
        return super().destroy(request, *args, **kwargs)


class EquipmentTypeFieldImpactView(APIView):
    """/T3 — число объектов Типа без значения реквизита, для предупреждения
    при переводе реквизита в обязательный задним числом."""

    permission_classes = [IsAdminOrAccountant]

    def get(self, request, type_pk, pk):
        field = get_object_or_404(EquipmentTypeField, pk=pk, equipment_type_id=type_pk)
        equipment_qs = Equipment.objects.filter(equipment_type_id=type_pk).prefetch_related("field_values")
        affected = count_missing_for_field(equipment_qs, field, "field_values")
        return Response({"affected_count": affected})


class EquipmentViewSet(viewsets.ModelViewSet):
    """Удаления нет — только списание (write_off)."""

    serializer_class = EquipmentSerializer
    permission_classes = [EquipmentAccessPermission]
    pagination_class = ELECursorPagination
    # DELETE разрешён на уровне диспетчеризации только ради экшена удаления файла
    # реквизита (ниже); удаление самого Оборудования запрещено — destroy() отдаёт
    # 405 (только списание).
    http_method_names = ["get", "post", "put", "patch", "delete", "head", "options"]
    filter_backends = [filters.OrderingFilter]
    ordering_fields = ["created_at", "equipment_type__name", "employee__last_name"]
    ordering = ["-created_at"]

    def destroy(self, request, *args, **kwargs):
        return Response({"detail": "Оборудование не удаляется — только списание."}, status=405)

    def get_queryset(self):
        qs = Equipment.objects.select_related("employee", "employee__avatar", "equipment_type").prefetch_related(
            "field_values__field", "custom_fields"
        )
        user = self.request.user
        if user.role == "employee" and not user.is_observer:
            # Не привязан к Сотруднику — не видит ничего, а не «все свободные».
            qs = qs.filter(employee_id=user.employee_id) if user.employee_id else qs.none()

        # Фильтры вкладки/статуса/поиска относятся только к списку. Для retrieve
        # и detail-действий их применять нельзя: иначе карточка архивного объекта
        # (tab по умолчанию «active») отдавала бы 404, а фронт вис бы на лоадере.
        if self.action != "list":
            return qs

        tab = self.request.query_params.get("tab", "active")
        qs = qs.filter(is_written_off=(tab == "archive"))

        status_param = self.request.query_params.get("status", "all")
        if status_param == "assigned":
            qs = qs.exclude(employee__isnull=True)
        elif status_param == "free":
            qs = qs.filter(employee__isnull=True)

        search = self.request.query_params.get("search")
        if search:
            qs = qs.filter(
                Q(inventory_number__icontains=search)
                | Q(employee__first_name__icontains=search)
                | Q(employee__last_name__icontains=search)
            )
        return qs

    @action(detail=True, methods=["post"], url_path="write-off", permission_classes=[IsAdminOrAccountant])
    def write_off(self, request, pk=None):
        from licenses.serializers import LicenseMiniSerializer

        equipment = self.get_object()
        detach = bool(request.data.get("detach_licenses"))
        active_licenses = equipment.licenses.filter(is_retired=False)
        if active_licenses.exists() and not detach:
            return Response(
                {
                    "detail": "У оборудования есть непогашенные лицензии.",
                    "licenses": LicenseMiniSerializer(active_licenses, many=True).data,
                },
                status=409,
            )
        if detach:
            # По одной, не bulk .update() — иначе не сработает история
            # (django-simple-history triggers только через save()).
            for lic in active_licenses:
                lic.equipment = None
                lic.save(update_fields=["equipment"])
        # Списанное оборудование выходит из обращения — снимаем закрепление за
        # Сотрудником (аналогично тому, как увольнение открепляет оборудование,
        #). Историю «за кем было закреплено» хранит журнал изменений.
        equipment.employee = None
        equipment.is_written_off = True
        equipment.written_off_at = timezone.now()
        equipment.save(update_fields=["employee", "is_written_off", "written_off_at"])
        return Response(EquipmentSerializer(equipment).data)

    @action(detail=True, methods=["post"], permission_classes=[IsAdminOrAccountant])
    def assign(self, request, pk=None):
        equipment = self.get_object()
        if equipment.is_written_off:
            return Response({"detail": "Списанное оборудование нельзя закрепить за сотрудником."}, status=409)
        employee = get_object_or_404(Employee, pk=request.data.get("employee"))
        equipment.employee = employee
        equipment.save(update_fields=["employee"])
        return Response(EquipmentSerializer(equipment).data)

    @action(detail=True, methods=["post"], permission_classes=[IsAdminOrAccountant])
    def unassign(self, request, pk=None):
        equipment = self.get_object()
        equipment.employee = None
        equipment.save(update_fields=["employee"])
        return Response(EquipmentSerializer(equipment).data)

    @action(detail=True, methods=["get"], url_path="history")
    def history_list(self, request, pk=None):
        from core.history import build_history_rows, build_related_history_rows
        from employees.models import Employee
        from storage.models import StoredFile

        eq = self.get_object()

        def fmt_employee(v):
            if not v:
                return "Не закреплено"
            emp = Employee.objects.filter(pk=v).first()
            return str(emp) if emp else "—"

        def fmt_type(v):
            t = EquipmentType.objects.filter(pk=v).first() if v else None
            return t.name if t else "—"

        field_specs = {
            "inventory_number": {"label": "Учётный номер"},
            "employee": {"label": "Закреплённый сотрудник", "format": fmt_employee},
            "is_written_off": {"label": "Признак списания", "format": lambda v: "Да" if v else "Нет"},
            "equipment_type": {"label": "Тип оборудования", "format": fmt_type},
        }
        rows = build_history_rows(eq, field_specs)

        # Реквизиты Типа (Параметры оборудования)
        type_fields = {}

        def field_of(rec):
            if rec.field_id not in type_fields:
                type_fields[rec.field_id] = EquipmentTypeField.objects.filter(pk=rec.field_id).first()
            return type_fields[rec.field_id]

        def fv_value(rec):
            f = field_of(rec)
            vt = f.value_type if f else "text"
            if vt == "bool":
                return None if rec.value_bool is None else ("Да" if rec.value_bool else "Нет")
            if vt == "int":
                return rec.value_int
            if vt == "float":
                return rec.value_float
            if vt == "file":
                if not rec.value_file_id:
                    return None
                return StoredFile.objects.filter(pk=rec.value_file_id).values_list("original_filename", flat=True).first() or "файл"
            return rec.value_text

        rows += build_related_history_rows(
            EquipmentFieldValue.history.filter(equipment_id=eq.id),
            label_fn=lambda rec: (field_of(rec).name if field_of(rec) else "Реквизит"),
            value_fn=fv_value,
        )
        # Дополнительные поля
        rows += build_related_history_rows(
            EquipmentCustomField.history.filter(equipment_id=eq.id),
            label_fn=lambda rec: rec.name,
            value_fn=lambda rec: rec.value,
        )

        rows.sort(key=lambda r: r["date"], reverse=True)
        return Response(rows)

    @action(
        detail=True,
        methods=["post", "delete"],
        url_path=r"field-values/(?P<field_id>[^/.]+)/file",
        permission_classes=[IsAdminOrAccountant],
    )
    def upload_field_file(self, request, pk=None, field_id=None):
        equipment = self.get_object()
        field = get_object_or_404(EquipmentTypeField, pk=field_id, equipment_type=equipment.equipment_type)
        if field.value_type != "file":
            return Response({"detail": "Реквизит не файлового типа."}, status=400)

        # Удаление прикреплённого файла реквизита (не только замена).
        if request.method == "DELETE":
            field_value = EquipmentFieldValue.objects.filter(equipment=equipment, field=field).first()
            if field_value and field_value.value_file_id:
                delete_stored_file(field_value.value_file)
                field_value.value_file = None
                field_value.save(update_fields=["value_file"])
            return Response(status=204)

        file_obj = request.FILES.get("file")
        if not file_obj:
            return Response({"detail": "Файл не передан."}, status=400)
        if file_obj.size > 20 * 1024 * 1024:
            return Response({"detail": "Файл больше 20 МБ."}, status=400)

        stored_file = store_uploaded_file(file_obj, "equipment/fields")
        field_value, created = EquipmentFieldValue.objects.get_or_create(equipment=equipment, field=field)
        if not created:
            delete_stored_file(field_value.value_file)
        field_value.value_file = stored_file
        field_value.save(update_fields=["value_file"])
        return Response(EquipmentFieldValueOutSerializer(field_value).data)
