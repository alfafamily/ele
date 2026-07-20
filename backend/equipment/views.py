from django.db.models import ProtectedError, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import filters, generics, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from core.eav import count_missing_for_field
from core.mixins import CreationCommentMixin
from core.pagination import ELECursorPagination
from core.permissions import EquipmentAccessPermission, IsAdminOrAccountant
from employees.models import Employee
from storage.service import delete_stored_file, store_uploaded_file

from .models import (
    Equipment,
    EquipmentCustomField,
    EquipmentFieldFile,
    EquipmentFieldValue,
    EquipmentType,
    EquipmentTypeField,
)
from .serializers import (
    EquipmentFieldValueOutSerializer,
    EquipmentSerializer,
    EquipmentTypeFieldSerializer,
    EquipmentTypeSerializer,
)


class EquipmentTypeViewSet(viewsets.ModelViewSet):
    queryset = EquipmentType.objects.all().order_by("name").prefetch_related("fields__options")
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
        return EquipmentTypeField.objects.filter(equipment_type_id=self.kwargs["type_pk"]).prefetch_related("options")

    def perform_create(self, serializer):
        equipment_type = get_object_or_404(EquipmentType, pk=self.kwargs["type_pk"])
        serializer.save(equipment_type=equipment_type)


class EquipmentTypeFieldDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = EquipmentTypeFieldSerializer
    permission_classes = [IsAdminOrAccountant]

    def get_queryset(self):
        return EquipmentTypeField.objects.filter(equipment_type_id=self.kwargs["type_pk"]).prefetch_related("options")

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


class EquipmentViewSet(CreationCommentMixin, viewsets.ModelViewSet):
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
        qs = Equipment.objects.select_related(
            "employee", "employee__avatar", "equipment_type", "place__room__building"
        ).prefetch_related(
            "field_values__field", "field_values__files__stored_file", "custom_fields", "place__employees"
        )
        user = self.request.user
        if user.role == "employee" and not user.is_observer:
            # Не привязан к Сотруднику — не видит ничего, а не «все свободные».
            qs = qs.filter(employee_id=user.employee_id) if user.employee_id else qs.none()

        # Фильтры вкладки/статуса/поиска относятся только к списку. Для retrieve
        # и detail-действий их применять нельзя: иначе карточка архивного объекта
        # (tab по умолчанию «active») отдавала бы 404, а фронт вис бы на лоадере.
        if self.action != "list":
            # На карточке (retrieve) отдаём «Номер/ключ» привязанных лицензий —
            # прогреваем field_values, чтобы не ловить N+1 при сериализации.
            return qs.prefetch_related("licenses__field_values__field")

        tab = self.request.query_params.get("tab", "active")
        qs = qs.filter(is_written_off=(tab == "archive"))

        # Фильтр по сотруднику — блок «Закреплённое оборудование» в Профиле.
        # Для роли «Сотрудник» список и так сужен до своего (см. выше).
        employee = self.request.query_params.get("employee")
        if employee:
            qs = qs.filter(employee_id=employee)

        status_param = self.request.query_params.get("status", "all")
        if status_param == "assigned":
            qs = qs.filter(employee__isnull=False)
        elif status_param == "stationary":
            qs = qs.filter(employee__isnull=True, place__place_type="workplace")
        elif status_param == "free":
            qs = qs.filter(employee__isnull=True).exclude(place__place_type="workplace")

        search = self.request.query_params.get("search")
        if search:
            # Поиск по Учётному номеру, ФИО Сотрудника, Типу и Модели.
            # «Модель» — зафиксированный (is_locked) реквизит Типа, значение в
            # value_text; join по field_values даёт дубли строк — снимаем distinct().
            qs = qs.filter(
                Q(inventory_number__icontains=search)
                | Q(employee__first_name__icontains=search)
                | Q(employee__last_name__icontains=search)
                | Q(equipment_type__name__icontains=search)
                | Q(field_values__field__is_locked=True, field_values__value_text__icontains=search)
            ).distinct()
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
        # Списанное выходит из обращения — снимаем любое размещение.
        equipment.employee = None
        equipment.place = None
        equipment.is_written_off = True
        equipment.written_off_at = timezone.now()
        comment = (request.data.get("comment") or "").strip()
        if comment:
            equipment._change_reason = comment
        equipment.save(update_fields=["employee", "place", "is_written_off", "written_off_at"])
        return Response(EquipmentSerializer(equipment).data)

    @action(detail=True, methods=["post"], permission_classes=[IsAdminOrAccountant])
    def assign(self, request, pk=None):
        """Закрепление оборудования: mode=mobile — за сотрудником; mode=stationary
        — на рабочем месте (без сотрудника). Прежнее размещение очищается."""
        from core.placement import get_workplace

        equipment = self.get_object()
        if equipment.is_written_off:
            return Response({"detail": "Списанное оборудование нельзя разместить."}, status=409)
        mode = request.data.get("mode", "mobile")
        if mode == "stationary":
            place = get_workplace(request.data.get("place"))
            equipment.place = place
            equipment.employee = None
        else:
            employee = get_object_or_404(Employee, pk=request.data.get("employee"))
            equipment.employee = employee
            equipment.place = None
        comment = (request.data.get("comment") or "").strip()
        if comment:
            equipment._change_reason = comment
        equipment.save(update_fields=["employee", "place"])
        return Response(EquipmentSerializer(equipment).data)

    @action(detail=True, methods=["post"], permission_classes=[IsAdminOrAccountant])
    def unassign(self, request, pk=None):
        """Открепление: оборудование уходит на склад (место хранения обязательно)."""
        from core.placement import get_storage_place

        equipment = self.get_object()
        place = get_storage_place(request.data.get("place"), field="place")
        equipment.employee = None
        equipment.place = place
        comment = (request.data.get("comment") or "").strip()
        if comment:
            equipment._change_reason = comment
        equipment.save(update_fields=["employee", "place"])
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

        def fmt_place(v):
            if not v:
                return "Не размещено"
            from locations.models import Place

            p = Place.objects.filter(pk=v).first()
            if not p:
                return "—"
            kind = "Рабочее место" if p.place_type == Place.PlaceType.WORKPLACE else "Место хранения"
            return f"{kind} «{p.name}»"

        field_specs = {
            "inventory_number": {"label": "Учётный номер"},
            "employee": {"label": "Закреплённый сотрудник", "format": fmt_employee, "in_created": False},
            "place": {"label": "Размещение", "format": fmt_place, "in_created": False},
            "is_written_off": {"label": "Признак списания", "format": lambda v: "Да" if v else "Нет", "in_created": False},
            "equipment_type": {"label": "Тип оборудования", "format": fmt_type},
        }

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

        related_rows = []
        created_extra = []

        req_rows, req_created = build_related_history_rows(
            EquipmentFieldValue.history.filter(equipment_id=eq.id),
            label_fn=lambda rec: (field_of(rec).name if field_of(rec) else "Реквизит"),
            value_fn=fv_value,
            created_at=eq.created_at,
        )
        related_rows += req_rows
        created_extra += req_created

        # Файлы реквизитов «Несколько файлов» — добавление/удаление отдельных
        # файлов (хранятся в EquipmentFieldFile, не в value_file).
        fv_field_name = dict(
            EquipmentFieldValue.objects.filter(equipment_id=eq.id).values_list("id", "field__name")
        )
        if fv_field_name:
            def file_value(rec):
                if not rec.stored_file_id:
                    return None
                return (
                    StoredFile.objects.filter(pk=rec.stored_file_id)
                    .values_list("original_filename", flat=True)
                    .first()
                    or "файл"
                )

            file_rows, file_created = build_related_history_rows(
                EquipmentFieldFile.history.filter(field_value_id__in=list(fv_field_name)),
                label_fn=lambda rec: fv_field_name.get(rec.field_value_id, "Файл реквизита"),
                value_fn=file_value,
                created_at=eq.created_at,
            )
            related_rows += file_rows
            created_extra += file_created

        # Дополнительные поля
        cf_rows, cf_created = build_related_history_rows(
            EquipmentCustomField.history.filter(equipment_id=eq.id),
            label_fn=lambda rec: rec.name,
            value_fn=lambda rec: rec.value,
            created_at=eq.created_at,
        )
        related_rows += cf_rows
        created_extra += cf_created

        # Привязка/снятие лицензий — движения оборудования (лицензии привязывают
        # с карточки оборудования). Связь хранится на стороне License
        # (License.equipment), поэтому собственная история оборудования её не
        # видит — восстанавливаем из истории лицензий: переход equipment_id к
        # этому оборудованию = «установлена», от него = «снята».
        from licenses.models import License

        lic_ids = set(License.history.filter(equipment_id=eq.id).values_list("id", flat=True))
        if lic_ids:
            lic_hist = list(
                License.history.filter(id__in=lic_ids)
                .select_related("history_user")
                .order_by("id", "history_date")
            )
            by_lic = {}
            for r in lic_hist:
                by_lic.setdefault(r.id, []).append(r)
            for recs in by_lic.values():
                prev_attached = False
                for r in recs:
                    attached = r.equipment_id == eq.id and r.history_type != "-"
                    if attached != prev_attached:
                        related_rows.append({
                            "date": r.history_date,
                            "author": r.history_user.email if r.history_user_id else None,
                            "kind": "changed", "category": "movement",
                            "label": "Установленная лицензия",
                            "old": "—" if attached else r.name,
                            "new": r.name if attached else "—",
                            "secret": False, "comment": None,
                        })
                    prev_attached = attached

        rows = build_history_rows(
            eq, field_specs,
            movement_fields={"employee", "place"},
            movement_events=[{
                "trigger": "is_written_off", "to": True,
                "consume": ["is_written_off", "written_off_at", "employee", "place"],
                "label": "Списано",
            }],
            created_extra_lines=created_extra,
        )
        rows += related_rows

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

        # Удаление одиночного файла реквизита (не только замена). Для реквизитов
        # с несколькими файлами удаление — через delete_field_file по id файла.
        if request.method == "DELETE":
            field_value = EquipmentFieldValue.objects.filter(equipment=equipment, field=field).first()
            if field_value and field_value.value_file_id:
                delete_stored_file(field_value.value_file)
                field_value.value_file = None
                field_value.save(update_fields=["value_file"])
            return Response(status=204)

        # getlist — реквизит с allow_multiple разрешает выбрать несколько файлов
        # за один раз (одиночный присылает один). Валидируем все до сохранения.
        file_objs = request.FILES.getlist("file")
        if not file_objs:
            return Response({"detail": "Файл не передан."}, status=400)
        for f in file_objs:
            if f.size > 20 * 1024 * 1024:
                return Response({"detail": f"Файл «{f.name}» больше 20 МБ."}, status=400)

        field_value, created = EquipmentFieldValue.objects.get_or_create(equipment=equipment, field=field)
        if field.allow_multiple:
            # Несколько файлов — добавляем в дочернюю таблицу. Если у реквизита
            # остался legacy одиночный value_file (флаг включили позже) —
            # переносим его туда же для единообразия.
            if field_value.value_file_id:
                EquipmentFieldFile.objects.create(field_value=field_value, stored_file=field_value.value_file)
                field_value.value_file = None
                field_value.save(update_fields=["value_file"])
            for f in file_objs:
                stored = store_uploaded_file(f, "equipment/fields")
                EquipmentFieldFile.objects.create(field_value=field_value, stored_file=stored)
        else:
            # Одиночный реквизит — берём первый файл, заменяя прежний.
            stored_file = store_uploaded_file(file_objs[0], "equipment/fields")
            if not created:
                delete_stored_file(field_value.value_file)
            field_value.value_file = stored_file
            field_value.save(update_fields=["value_file"])
        return Response(EquipmentFieldValueOutSerializer(field_value).data)

    @action(
        detail=True,
        methods=["delete"],
        url_path=r"field-values/(?P<field_id>[^/.]+)/files/(?P<file_pk>[^/.]+)",
        permission_classes=[IsAdminOrAccountant],
    )
    def delete_field_file(self, request, pk=None, field_id=None, file_pk=None):
        equipment = self.get_object()
        field_file = get_object_or_404(
            EquipmentFieldFile,
            pk=file_pk,
            field_value__equipment=equipment,
            field_value__field_id=field_id,
        )
        stored = field_file.stored_file
        field_file.delete()
        delete_stored_file(stored)
        return Response(status=204)
