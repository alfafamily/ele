from django.db.models import ProtectedError
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import filters, generics, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from core.eav import count_missing_for_field
from core.pagination import ELECursorPagination
from core.permissions import IsAdminOrAccountant
from storage.service import delete_stored_file, store_uploaded_file

from .models import License, LicenseCustomField, LicenseFieldValue, LicenseType, LicenseTypeField
from .serializers import (
    LicenseFieldValueOutSerializer,
    LicenseListSerializer,
    LicenseSerializer,
    LicenseTypeFieldSerializer,
    LicenseTypeSerializer,
)


class LicenseTypeViewSet(viewsets.ModelViewSet):
    queryset = LicenseType.objects.all().order_by("name")
    serializer_class = LicenseTypeSerializer
    permission_classes = [IsAdminOrAccountant]

    def destroy(self, request, *args, **kwargs):
        # ProtectedError покрывает и is_locked (модельный delete()), и
        # привязанные объекты (PROTECT на License.license_type) — §3.7, §5.4.
        # Сообщение всегда своё, не техническое из исключения Django.
        try:
            return super().destroy(request, *args, **kwargs)
        except ProtectedError:
            return Response(
                {"detail": "Тип нельзя удалить — он базовый или к нему привязаны объекты. Доступно архивирование."},
                status=409,
            )


class LicenseTypeFieldListView(generics.ListCreateAPIView):
    serializer_class = LicenseTypeFieldSerializer
    permission_classes = [IsAdminOrAccountant]

    def get_queryset(self):
        return LicenseTypeField.objects.filter(license_type_id=self.kwargs["type_pk"])

    def perform_create(self, serializer):
        license_type = get_object_or_404(LicenseType, pk=self.kwargs["type_pk"])
        serializer.save(license_type=license_type)


class LicenseTypeFieldDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = LicenseTypeFieldSerializer
    permission_classes = [IsAdminOrAccountant]

    def get_queryset(self):
        return LicenseTypeField.objects.filter(license_type_id=self.kwargs["type_pk"])

    def destroy(self, request, *args, **kwargs):
        try:
            return super().destroy(request, *args, **kwargs)
        except ProtectedError:
            return Response({"detail": "Зафиксированный реквизит нельзя удалить."}, status=409)


class LicenseTypeFieldImpactView(APIView):
    permission_classes = [IsAdminOrAccountant]

    def get(self, request, type_pk, pk):
        field = get_object_or_404(LicenseTypeField, pk=pk, license_type_id=type_pk)
        license_qs = License.objects.filter(license_type_id=type_pk).prefetch_related("field_values")
        affected = count_missing_for_field(license_qs, field, "field_values")
        return Response({"affected_count": affected})


class LicenseViewSet(viewsets.ModelViewSet):
    """Раздел целиком недоступен роли «Сотрудник» (§2.3) — свои лицензии видны
    только в карточке привязанного Оборудования. Удаления нет — только
    утилизация (utilize)."""

    permission_classes = [IsAdminOrAccountant]
    pagination_class = ELECursorPagination
    # DELETE разрешён только ради экшена удаления файла реквизита (ниже);
    # удаление самой Лицензии запрещено — destroy() отдаёт 405 (только
    # утилизация, §5.2).
    http_method_names = ["get", "post", "put", "patch", "delete", "head", "options"]
    filter_backends = [filters.OrderingFilter]
    ordering_fields = ["created_at", "name", "equipment__inventory_number"]
    ordering = ["-created_at"]

    def destroy(self, request, *args, **kwargs):
        return Response({"detail": "Лицензия не удаляется — только утилизация."}, status=405)

    def get_serializer_class(self):
        return LicenseListSerializer if self.action == "list" else LicenseSerializer

    def get_queryset(self):
        qs = License.objects.select_related("equipment", "equipment__equipment_type", "license_type").prefetch_related(
            "field_values__field", "custom_fields"
        )
        # Фильтры списка — только для list; иначе карточка утилизированной
        # (архивной) Лицензии отдавала бы 404 и висла бы на лоадере (как было
        # с архивным Оборудованием).
        if self.action != "list":
            return qs

        tab = self.request.query_params.get("tab", "active")
        qs = qs.filter(is_retired=(tab == "archive"))

        status_param = self.request.query_params.get("status", "all")
        if status_param == "occupied":
            qs = qs.exclude(equipment__isnull=True)
        elif status_param == "free":
            qs = qs.filter(equipment__isnull=True)

        search = self.request.query_params.get("search")
        if search:
            qs = qs.filter(equipment__inventory_number__icontains=search)
        return qs

    @action(detail=True, methods=["post"], permission_classes=[IsAdminOrAccountant])
    def utilize(self, request, pk=None):
        license_obj = self.get_object()
        license_obj.is_retired = True
        license_obj.retired_at = timezone.now()
        license_obj.equipment = None
        license_obj.save(update_fields=["is_retired", "retired_at", "equipment"])
        return Response(LicenseSerializer(license_obj).data)

    @action(detail=True, methods=["get"], url_path="history")
    def history_list(self, request, pk=None):
        from core.history import build_history_rows, build_related_history_rows
        from equipment.models import Equipment
        from storage.models import StoredFile

        lic = self.get_object()

        def fmt_equipment(v):
            if not v:
                return "Не привязана"
            inv = Equipment.objects.filter(pk=v).values_list("inventory_number", flat=True).first()
            return inv or "—"

        def fmt_type(v):
            t = LicenseType.objects.filter(pk=v).first() if v else None
            return t.name if t else "—"

        field_specs = {
            "name": {"label": "Наименование"},
            "equipment": {"label": "Оборудование", "format": fmt_equipment},
            "is_retired": {"label": "Признак утилизации", "format": lambda v: "Да" if v else "Нет"},
            "license_type": {"label": "Тип лицензии", "format": fmt_type},
        }
        rows = build_history_rows(lic, field_specs)

        # Реквизиты Типа (Параметры лицензии), включая маскируемый «Номер/ключ»
        type_fields = {}

        def field_of(rec):
            if rec.field_id not in type_fields:
                type_fields[rec.field_id] = LicenseTypeField.objects.filter(pk=rec.field_id).first()
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

        def fv_secret(rec):
            f = field_of(rec)
            return bool(f and f.name == "Номер/ключ")

        rows += build_related_history_rows(
            LicenseFieldValue.history.filter(license_id=lic.id),
            label_fn=lambda rec: (field_of(rec).name if field_of(rec) else "Реквизит"),
            value_fn=fv_value,
            secret_fn=fv_secret,
        )
        rows += build_related_history_rows(
            LicenseCustomField.history.filter(license_id=lic.id),
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
        license_obj = self.get_object()
        field = get_object_or_404(LicenseTypeField, pk=field_id, license_type=license_obj.license_type)
        if field.value_type != "file":
            return Response({"detail": "Реквизит не файлового типа."}, status=400)

        # Удаление прикреплённого файла реквизита (не только замена).
        if request.method == "DELETE":
            field_value = LicenseFieldValue.objects.filter(license=license_obj, field=field).first()
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

        stored_file = store_uploaded_file(file_obj, "licenses/fields")
        field_value, created = LicenseFieldValue.objects.get_or_create(license=license_obj, field=field)
        if not created:
            delete_stored_file(field_value.value_file)
        field_value.value_file = stored_file
        field_value.save(update_fields=["value_file"])
        return Response(LicenseFieldValueOutSerializer(field_value).data)
