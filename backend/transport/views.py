from django.db import transaction
from django.db.models import Max, ProtectedError, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import filters, generics, serializers, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from core.eav import count_missing_for_field
from core.eav_filters import csv_ids, eav_field_value_suggestions, eav_req_conditions
from core.mixins import CreationCommentMixin
from core.pagination import ELECursorPagination
from core.permissions import (
    CanManageTransportMaintenance,
    CanPerformTransportMaintenance,
    IsAdminOrAccountant,
    TransportAccessPermission,
    TransportRegulationAccessPermission,
    can_maintain_transport_type,
)
from employees.models import Employee
from equipment.maintenance import add_months, plan_sort_key, plan_status
from storage.service import delete_stored_file, store_uploaded_file

from .maintenance import (
    archive_transport_maintenance,
    create_plan_for_individual_regulation,
    create_plans_for_type_regulation,
    set_regulation_archived,
)
from .models import (
    MaintenanceRecord,
    MaintenanceRecordItem,
    MaintenanceRegulation,
    Transport,
    TransportCustomField,
    TransportFieldFile,
    TransportFieldValue,
    TransportMaintenancePlan,
    TransportType,
    TransportTypeField,
)
from .serializers import (
    MaintenanceRegulationSerializer,
    PerformMaintenanceSerializer,
    TransportFieldValueOutSerializer,
    TransportMiniSerializer,
    TransportSerializer,
    TransportTypeFieldSerializer,
    TransportTypeSerializer,
)


class TransportTypeViewSet(viewsets.ModelViewSet):
    queryset = TransportType.objects.all().order_by("name").prefetch_related("fields__options")
    serializer_class = TransportTypeSerializer
    permission_classes = [IsAdminOrAccountant]

    def destroy(self, request, *args, **kwargs):
        try:
            return super().destroy(request, *args, **kwargs)
        except ProtectedError:
            return Response(
                {"detail": "Нельзя удалить Тип — к нему привязаны объекты. Доступно архивирование."}, status=409
            )


class TransportTypeFieldListView(generics.ListCreateAPIView):
    serializer_class = TransportTypeFieldSerializer
    permission_classes = [IsAdminOrAccountant]

    def get_queryset(self):
        return TransportTypeField.objects.filter(transport_type_id=self.kwargs["type_pk"]).prefetch_related("options")

    def perform_create(self, serializer):
        transport_type = get_object_or_404(TransportType, pk=self.kwargs["type_pk"])
        max_order = transport_type.fields.aggregate(m=Max("order"))["m"]
        serializer.save(transport_type=transport_type, order=(max_order or 0) + 1)


class TransportTypeFieldReorderView(APIView):
    """Сохранить пользовательский порядок реквизитов Типа. Принимает
    {"order": [id, ...]} — полный список id в желаемом порядке (залоченные первыми)."""

    permission_classes = [IsAdminOrAccountant]

    def post(self, request, type_pk):
        transport_type = get_object_or_404(TransportType, pk=type_pk)
        ids = request.data.get("order", [])
        fields = {f.id: f for f in transport_type.fields.all()}
        if not isinstance(ids, list) or set(ids) != set(fields.keys()):
            return Response({"detail": "Список реквизитов не совпадает с реквизитами Типа."}, status=400)
        with transaction.atomic():
            for i, fid in enumerate(ids):
                field = fields[fid]
                if field.order != i:
                    field.order = i
                    field.save(update_fields=["order"])
        ordered = transport_type.fields.prefetch_related("options").all()
        return Response(TransportTypeFieldSerializer(ordered, many=True).data)


class TransportTypeFieldDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = TransportTypeFieldSerializer
    permission_classes = [IsAdminOrAccountant]

    def get_queryset(self):
        return TransportTypeField.objects.filter(transport_type_id=self.kwargs["type_pk"]).prefetch_related("options")

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.is_locked:
            return Response({"detail": f"Базовый реквизит «{instance.name}» нельзя удалить."}, status=409)
        return super().destroy(request, *args, **kwargs)


class TransportTypeFieldImpactView(APIView):
    """Число объектов Типа без значения реквизита — для предупреждения при переводе
    реквизита в обязательный задним числом."""

    permission_classes = [IsAdminOrAccountant]

    def get(self, request, type_pk, pk):
        field = get_object_or_404(TransportTypeField, pk=pk, transport_type_id=type_pk)
        transport_qs = Transport.objects.filter(transport_type_id=type_pk).prefetch_related("field_values")
        affected = count_missing_for_field(transport_qs, field, "field_values")
        return Response({"affected_count": affected})


class TypeRegulationListView(generics.ListCreateAPIView):
    """B22. Регламенты ТО типа транспорта (наследуются всем транспортом типа)."""

    serializer_class = MaintenanceRegulationSerializer
    permission_classes = [CanManageTransportMaintenance]

    def get_queryset(self):
        return MaintenanceRegulation.objects.filter(transport_type_id=self.kwargs["type_pk"]).prefetch_related("items")

    def perform_create(self, serializer):
        transport_type = get_object_or_404(TransportType, pk=self.kwargs["type_pk"])
        regulation = serializer.save(transport_type=transport_type)
        create_plans_for_type_regulation(regulation)


class TypeRegulationDetailView(generics.RetrieveUpdateAPIView):
    """B22. Правка регламента типа или архив/возврат (PATCH is_archived)."""

    serializer_class = MaintenanceRegulationSerializer
    permission_classes = [CanManageTransportMaintenance]

    def get_queryset(self):
        return MaintenanceRegulation.objects.filter(transport_type_id=self.kwargs["type_pk"]).prefetch_related("items")

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        if "is_archived" in request.data and set(request.data.keys()) <= {"is_archived"}:
            set_regulation_archived(instance, bool(request.data["is_archived"]))
            return Response(self.get_serializer(instance).data)
        return super().update(request, *args, **kwargs)


class TransportViewSet(CreationCommentMixin, viewsets.ModelViewSet):
    """Удаления нет — только списание (write_off)."""

    serializer_class = TransportSerializer
    permission_classes = [TransportAccessPermission]
    pagination_class = ELECursorPagination
    http_method_names = ["get", "post", "put", "patch", "delete", "head", "options"]
    filter_backends = [filters.OrderingFilter]
    ordering_fields = ["created_at", "transport_type__name", "employee__last_name"]
    ordering = ["-created_at"]

    def perform_create(self, serializer):
        super().perform_create(serializer)
        # B32: транспорт создан сразу за сотрудником — эпизод акцепта.
        t = serializer.instance
        if t.employee_id:
            from core.assignments import create_assignment

            create_assignment(t, t.employee, self.request.user, return_place=None)

    def destroy(self, request, *args, **kwargs):
        return Response({"detail": "Транспорт не удаляется — только списание."}, status=405)

    def get_queryset(self):
        from core.assignments import annotate_acceptance

        qs = Transport.objects.select_related(
            "employee", "employee__avatar", "transport_type"
        ).prefetch_related(
            "field_values__field", "field_values__files__stored_file", "custom_fields",
            "maintenance_plans__regulation", "maintenance_records",
            "parking_spots__room__building", "parking_spots__room__plan_file",
            "passes__buildings",
        )
        qs = annotate_acceptance(qs, Transport)  # B32
        user = self.request.user
        # Обычный «Сотрудник» (не Наблюдатель) видит только свой транспорт — для
        # блока «Транспорт» в Профиле. Не привязан к Сотруднику — не видит ничего.
        if user.role == "employee" and not user.is_observer:
            qs = qs.filter(employee_id=user.employee_id) if user.employee_id else qs.none()
        # Роль «Автомеханик» видит только транспорт своей области типов (и в списке,
        # и на карточке). При «все типы» — весь транспорт; при ограничении — только
        # выбранные типы. Учётчик/админ видят всё.
        if user.role == "automechanic":
            if not getattr(user, "maintenance_all_transport_types", True):
                qs = qs.filter(transport_type_id__in=user.maintenance_transport_types.values_list("id", flat=True))

        if self.action != "list":
            return qs

        tab = self.request.query_params.get("tab", "active")
        qs = qs.filter(is_written_off=(tab == "archive"))

        # «Закреплён за»: за сотрудником / свободен.
        assigned = self.request.query_params.get("assigned")
        employee = self.request.query_params.get("employee")
        if assigned == "employee":
            ids = csv_ids(employee)
            qs = qs.filter(employee_id__in=ids) if ids else qs.filter(employee__isnull=False)
        elif assigned == "free":
            qs = qs.filter(employee__isnull=True)
        elif employee:
            qs = qs.filter(employee_id__in=csv_ids(employee))

        # Фильтр по Типам (мультивыбор) + реквизитам выбранных Типов.
        type_ids = csv_ids(self.request.query_params.get("type"))
        if type_ids:
            qs = qs.filter(transport_type_id__in=type_ids)
        for cond in eav_req_conditions(
            self.request.query_params,
            value_model=TransportFieldValue,
            field_model=TransportTypeField,
            object_fk="transport",
            type_field="transport_type",
        ):
            qs = qs.filter(cond)

        # Фильтры по статусу ТО (по активным планам).
        to_due = self.request.query_params.get("to_due") == "1"
        to_overdue = self.request.query_params.get("to_overdue") == "1"
        to_unset = self.request.query_params.get("to_unset") == "1"
        if to_due or to_overdue or to_unset:
            from datetime import timedelta

            from django.db.models import Exists, OuterRef

            from equipment.maintenance import DUE_SOON_DAYS

            today = timezone.localdate()
            active = TransportMaintenancePlan.objects.filter(
                transport=OuterRef("pk"),
                is_cancelled=False,
                regulation__is_archived=False,
                regulation__on_demand=False,
            )
            cond = None
            if to_overdue:
                cond = Exists(active.filter(next_planned_date__lt=today))
            if to_due:
                due = Exists(active.filter(
                    next_planned_date__gte=today,
                    next_planned_date__lte=today + timedelta(days=DUE_SOON_DAYS),
                ))
                cond = due if cond is None else (cond | due)
            if to_unset:
                unset = Exists(active.filter(next_planned_date__isnull=True))
                cond = unset if cond is None else (cond | unset)
            qs = qs.filter(cond)

        search = self.request.query_params.get("search")
        if search:
            # Поиск по Учётному номеру; Типу; базовым реквизитам (Модель/Гос.номер)
            # и закреплённому Сотруднику. Базовые реквизиты — is_locked, значение в
            # value_text; join даёт дубли — снимаем distinct().
            qs = qs.filter(
                Q(inventory_number__icontains=search)
                | Q(transport_type__name__icontains=search)
                | Q(field_values__field__is_locked=True, field_values__value_text__icontains=search)
                | Q(employee__first_name__icontains=search)
                | Q(employee__last_name__icontains=search)
                | Q(employee__position__icontains=search)
                | Q(employee__department__icontains=search)
            ).distinct()
        return qs

    @action(detail=False, methods=["get"], permission_classes=[IsAdminOrAccountant])
    def picker(self, request):
        """Плоский список действующего (не списанного) транспорта для подбора.
        Поиск как в основном списке. По умолчанию (закрепление за парковочным
        местом) исключается транспорт, уже стоящий на другом парковочном месте
        (одно место на авто); ?place=<id> оставляет транспорт этого места (при
        редактировании). Для подбора транспорта под пропуск (?purpose=pass, B34)
        парковка роли не играет — исключение не применяется."""
        from locations.models import Place

        qs = Transport.objects.filter(is_written_off=False).select_related("transport_type").prefetch_related(
            "field_values__field"
        )
        if request.query_params.get("purpose") != "pass":
            occupied = Place.objects.filter(
                place_type=Place.PlaceType.PARKING_SPOT, is_archived=False
            )
            place_id = request.query_params.get("place")
            if place_id:
                occupied = occupied.exclude(pk=place_id)
            # Исключаем транспорт, стоящий на любом из этих мест (через reverse M2M —
            # без NULL-ловушки NOT IN, если бы брали values("transport") пустых мест).
            qs = qs.exclude(parking_spots__in=occupied)

        search = request.query_params.get("search")
        if search:
            qs = qs.filter(
                Q(inventory_number__icontains=search)
                | Q(transport_type__name__icontains=search)
                | Q(field_values__field__is_locked=True, field_values__value_text__icontains=search)
            ).distinct()
        qs = qs.order_by("transport_type__name", "inventory_number")[:50]
        return Response(TransportMiniSerializer(qs, many=True).data)

    @action(detail=True, methods=["post"], permission_classes=[IsAdminOrAccountant])
    def parking(self, request, pk=None):
        """Парковка транспорта. body: {"mode": "spot", "place": <id>} —
        закрепить за парковочным местом; {"mode": "driver_address"} — парковка на
        адресе водителя; {"mode": "none"} — снять парковку. Одно место на авто."""
        from locations.models import Place

        transport = self.get_object()
        if transport.is_written_off:
            return Response({"detail": "Транспорт списан."}, status=400)
        mode = request.data.get("mode")

        # Снимаем с текущего места (если было) в любом режиме.
        for spot in list(transport.parking_spots.all()):
            spot.transport.remove(transport)

        if mode == "spot":
            place = get_object_or_404(Place, pk=request.data.get("place"))
            if place.place_type != Place.PlaceType.PARKING_SPOT or place.is_archived:
                return Response({"detail": "Нужно выбрать действующее парковочное место."}, status=400)
            if place.employees.exists():
                return Response(
                    {"detail": "На этом месте закреплён личный авто сотрудника — транспорт компании добавить нельзя."},
                    status=400,
                )
            if place.transport.exclude(pk=transport.pk).exists():
                return Response(
                    {"detail": "Это парковочное место уже занято другим транспортом."},
                    status=400,
                )
            place.transport.add(transport)
            transport.parks_at_driver_address = False
        elif mode == "driver_address":
            # «На адресе сотрудника» осмысленно только при закреплённом сотруднике.
            if not transport.employee_id:
                return Response(
                    {"detail": "«На адресе сотрудника» доступно только для транспорта, закреплённого за сотрудником."},
                    status=400,
                )
            transport.parks_at_driver_address = True
        elif mode == "none":
            transport.parks_at_driver_address = False
        else:
            return Response({"detail": "Неизвестный режим парковки."}, status=400)
        transport.save(update_fields=["parks_at_driver_address"])
        # Сбрасываем prefetch-кэш (parking_spots M2M изменён после выборки объекта),
        # иначе сериализатор вернёт устаревшую парковку.
        transport._prefetched_objects_cache = {}
        return Response(self.get_serializer(transport).data)

    @action(detail=False, methods=["get"], url_path="field-values")
    def field_values(self, request):
        """Автоподсказка существующих значений реквизита (текст/число) для фильтра."""
        field_id = request.query_params.get("field")
        if not field_id:
            return Response([])
        field = get_object_or_404(TransportTypeField, pk=field_id)
        return Response(
            eav_field_value_suggestions(field, TransportFieldValue, search=request.query_params.get("search", ""))
        )

    @action(detail=True, methods=["post"], url_path="write-off", permission_classes=[IsAdminOrAccountant])
    def write_off(self, request, pk=None):
        transport = self.get_object()
        # Списанное выходит из обращения — снимаем закрепление за Сотрудником.
        transport.employee = None
        transport.is_written_off = True
        transport.written_off_at = timezone.now()
        comment = (request.data.get("comment") or "").strip()
        if comment:
            transport._change_reason = comment
        transport.save(update_fields=["employee", "is_written_off", "written_off_at"])
        from core.assignments import close_open_assignment

        close_open_assignment(transport)  # B32
        # Списание выводит ТО из обращения.
        archive_transport_maintenance(transport)
        return Response(TransportSerializer(transport).data)

    @action(detail=True, methods=["post"], permission_classes=[IsAdminOrAccountant])
    def assign(self, request, pk=None):
        """Закрепление транспорта за сотрудником."""
        transport = self.get_object()
        if transport.is_written_off:
            return Response({"detail": "Списанный транспорт нельзя закрепить."}, status=409)
        employee = get_object_or_404(Employee, pk=request.data.get("employee"))
        transport.employee = employee
        comment = (request.data.get("comment") or "").strip()
        if comment:
            transport._change_reason = comment
        transport.save(update_fields=["employee"])
        from core.assignments import create_assignment

        create_assignment(transport, employee, request.user, return_place=None)  # B32
        return Response(TransportSerializer(transport).data)

    @action(detail=True, methods=["post"], permission_classes=[IsAdminOrAccountant])
    def unassign(self, request, pk=None):
        """Открепление транспорта — становится свободным. Если была парковка «на
        адресе сотрудника», она относилась к этому сотруднику — снимаем её тоже
        (нового сотрудника нет). Закрепление за парковочным местом не трогаем."""
        transport = self.get_object()
        transport.employee = None
        update_fields = ["employee"]
        if transport.parks_at_driver_address:
            transport.parks_at_driver_address = False
            update_fields.append("parks_at_driver_address")
        comment = (request.data.get("comment") or "").strip()
        if comment:
            transport._change_reason = comment
        transport.save(update_fields=update_fields)
        from core.assignments import close_open_assignment

        close_open_assignment(transport)  # B32
        return Response(TransportSerializer(transport).data)

    @action(detail=True, methods=["post"], url_path="maintenance", permission_classes=[CanPerformTransportMaintenance])
    def perform_maintenance(self, request, pk=None):
        """B22. Провести ТО по регламенту (или «Внеплановое»). Дополнительно
        фиксирует пробег/моточасы (mileage) — необязательно, в историю."""
        transport = self.get_object()
        # Область типов — вне выбранных типов ТО проводить нельзя.
        if not can_maintain_transport_type(request, transport.transport_type_id):
            return Response({"detail": "Проведение ТО для этого типа транспорта вам недоступно."}, status=403)
        if transport.is_written_off:
            return Response({"detail": "По списанному транспорту ТО не проводится."}, status=409)

        serializer = PerformMaintenanceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        regulation = data.get("regulation")
        plan = None
        if regulation is not None:
            plan = TransportMaintenancePlan.objects.filter(transport=transport, regulation=regulation).first()
            if plan is None or plan.is_cancelled or regulation.is_archived:
                return Response({"detail": "Регламент недоступен для этого транспорта."}, status=409)

        items = data["items"]
        active_items = [i for i in items if not i["is_cancelled"]]
        if not active_items:
            return Response({"detail": "Добавьте хотя бы одну (неотменённую) работу или материал."}, status=400)

        # Контроль пробега: новый пробег/моточасы должен быть строго больше
        # последнего зафиксированного (пробег только растёт). Поле необязательное —
        # если не указано, проверку пропускаем.
        mileage = data.get("mileage")
        if mileage is not None:
            # Сравниваем с максимальным зафиксированным (одометр только растёт) —
            # устойчиво к порядку ввода.
            last = (
                transport.maintenance_records.filter(mileage__isnull=False)
                .order_by("-mileage", "-performed_at", "-id").first()
            )
            if last is not None and mileage <= last.mileage:
                unit = _mileage_unit_label(transport)
                return Response(
                    {"detail": f"Пробег должен быть больше последнего зафиксированного ({_fmt_quantity(last.mileage)} {unit})."},
                    status=400,
                )

        is_periodic = regulation is not None and not regulation.on_demand
        next_date = data.get("next_planned_date")
        if is_periodic:
            today = timezone.localdate()
            if next_date is None:
                return Response({"detail": "Укажите дату следующего ТО."}, status=400)
            if next_date < today:
                return Response({"detail": "Дата следующего ТО не может быть в прошлом."}, status=400)
            max_date = add_months(today, regulation.period_months)
            if next_date > max_date:
                return Response(
                    {"detail": f"Дата следующего ТО не может быть позже расчётной ({max_date:%d.%m.%Y})."},
                    status=400,
                )
        else:
            next_date = None

        with transaction.atomic():
            record = MaintenanceRecord.objects.create(
                transport=transport,
                regulation=regulation,
                regulation_name=(regulation.name if regulation else ""),
                next_planned_date=next_date,
                prior_planned_date=(plan.next_planned_date if plan else None),
                mileage=data.get("mileage"),
                comment=(data.get("comment") or "").strip(),
                created_by=request.user if request.user.is_authenticated else None,
            )
            MaintenanceRecordItem.objects.bulk_create([
                MaintenanceRecordItem(
                    record=record,
                    kind=item["kind"],
                    name=item["name"].strip(),
                    quantity=item["quantity"],
                    from_regulation=item["from_regulation"],
                    is_cancelled=item["is_cancelled"],
                    cancel_reason=(item.get("cancel_reason") or "").strip(),
                )
                for item in items
            ])
            if plan is not None and is_periodic:
                plan.next_planned_date = next_date
                plan.save(update_fields=["next_planned_date"])

        # B44. Уведомление «Выполненное ТО» (admin/accountant, кроме исполнителя).
        from accounts.notifications import notify_maintenance
        from accounts.models import NotificationKind

        notify_maintenance(
            transport, NotificationKind.MAINTENANCE_PERFORMED,
            date=timezone.localdate(), exclude_user=request.user,
            regulation_name=record.regulation_name,
        )
        return Response(TransportSerializer(transport, context=self.get_serializer_context()).data)

    @action(detail=True, methods=["get", "post"], url_path="regulations", permission_classes=[TransportRegulationAccessPermission])
    def regulations(self, request, pk=None):
        """B22. GET — сводный список регламентов транспорта. POST — создать
        индивидуальный регламент (+ план)."""
        transport = self.get_object()
        if request.method == "POST":
            if not CanManageTransportMaintenance().has_permission(request, self):
                return Response({"detail": "Недостаточно прав."}, status=403)
            serializer = MaintenanceRegulationSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            regulation = serializer.save(transport=transport)
            create_plan_for_individual_regulation(regulation)
            raw_date = request.data.get("next_planned_date")
            if raw_date and not regulation.on_demand:
                date = serializers.DateField().to_internal_value(raw_date)
                if date >= timezone.localdate():
                    regulation.plans.filter(transport=transport).update(next_planned_date=date)
            return Response(self._regulation_payload(transport), status=201)
        return Response(self._regulation_payload(transport))

    def _regulation_payload(self, transport):
        regs = list(
            MaintenanceRegulation.objects.filter(
                Q(transport_type_id=transport.transport_type_id, is_archived=False)
                | Q(transport_id=transport.id)
            ).prefetch_related("items")
        )
        plans = {
            p.regulation_id: p
            for p in TransportMaintenancePlan.objects.filter(transport=transport, regulation__in=regs)
        }
        today = timezone.localdate()
        rows = []
        for reg in regs:
            plan = plans.get(reg.id)
            status = None
            if plan is not None and not plan.is_cancelled and not reg.is_archived and not reg.on_demand:
                status = plan_status(plan.next_planned_date, today)
            rows.append({
                "id": reg.id,
                "name": reg.name,
                "scope": reg.scope,
                "period_months": reg.period_months,
                "on_demand": reg.on_demand,
                "is_archived": reg.is_archived,
                "items": MaintenanceRegulationSerializer(reg).data["items"],
                "plan": {
                    "next_planned_date": plan.next_planned_date.isoformat() if plan and plan.next_planned_date else None,
                    "is_cancelled": plan.is_cancelled if plan else False,
                },
                "status": status,
            })

        def sort_key(row):
            plan = plans.get(row["id"])
            inactive = row["is_archived"] or (plan.is_cancelled if plan else True)
            return (1 if inactive else 0,) + (plan_sort_key(plan, today) if plan else (99, today, 0))
        rows.sort(key=sort_key)
        return rows

    @action(
        detail=True,
        methods=["patch", "delete"],
        url_path=r"regulations/(?P<reg_pk>[^/.]+)",
        permission_classes=[CanManageTransportMaintenance],
    )
    def regulation_detail(self, request, pk=None, reg_pk=None):
        """B22. Индивидуальный регламент транспорта: правка или архив/возврат."""
        transport = self.get_object()
        regulation = get_object_or_404(MaintenanceRegulation, pk=reg_pk, transport=transport)
        if request.method == "DELETE":
            set_regulation_archived(regulation, True)
            return Response(self._regulation_payload(transport))
        if "is_archived" in request.data and set(request.data.keys()) <= {"is_archived"}:
            set_regulation_archived(regulation, bool(request.data["is_archived"]))
            return Response(self._regulation_payload(transport))
        serializer = MaintenanceRegulationSerializer(regulation, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(self._regulation_payload(transport))

    @action(
        detail=True,
        methods=["patch"],
        url_path=r"regulations/(?P<reg_pk>[^/.]+)/plan",
        permission_classes=[CanManageTransportMaintenance],
    )
    def regulation_plan(self, request, pk=None, reg_pk=None):
        """B22. Per-transport действия над планом: отмена/возврат и установка даты."""
        transport = self.get_object()
        regulation = get_object_or_404(
            MaintenanceRegulation,
            Q(transport_type_id=transport.transport_type_id) | Q(transport=transport),
            pk=reg_pk,
        )
        plan, _ = TransportMaintenancePlan.objects.get_or_create(transport=transport, regulation=regulation)
        if regulation.is_archived:
            return Response({"detail": "Регламент в архиве."}, status=409)

        if "is_cancelled" in request.data:
            cancelled = bool(request.data["is_cancelled"])
            plan.is_cancelled = cancelled
            plan.next_planned_date = None
            plan.save(update_fields=["is_cancelled", "next_planned_date"])
            return Response(self._regulation_payload(transport))

        if "next_planned_date" in request.data:
            if plan.is_cancelled:
                return Response({"detail": "Регламент отменён для этого транспорта."}, status=409)
            if regulation.on_demand:
                return Response({"detail": "Для регламента «по потребности» дата не задаётся."}, status=409)
            raw = request.data.get("next_planned_date")
            date = serializers.DateField().to_internal_value(raw) if raw else None
            if date is None:
                return Response({"detail": "Укажите дату."}, status=400)
            if date < timezone.localdate():
                return Response({"detail": "Дата не может быть в прошлом."}, status=400)
            plan.next_planned_date = date
            plan.save(update_fields=["next_planned_date"])
            return Response(self._regulation_payload(transport))

        return Response({"detail": "Нет изменений."}, status=400)

    @action(detail=True, methods=["get"], url_path="history")
    def history_list(self, request, pk=None):
        from core.history import build_history_rows, build_related_history_rows
        from storage.models import StoredFile

        obj = self.get_object()

        def fmt_employee(v):
            if not v:
                return "Не закреплено"
            emp = Employee.objects.filter(pk=v).first()
            return str(emp) if emp else "—"

        def fmt_type(v):
            t = TransportType.objects.filter(pk=v).first() if v else None
            return t.name if t else "—"

        field_specs = {
            "inventory_number": {"label": "Учётный номер"},
            "employee": {"label": "Закреплённый сотрудник", "format": fmt_employee, "in_created": False},
            "is_written_off": {"label": "Признак списания", "format": lambda v: "Да" if v else "Нет", "in_created": False},
            "transport_type": {"label": "Тип транспорта", "format": fmt_type},
        }

        type_fields = {}

        def field_of(rec):
            if rec.field_id not in type_fields:
                type_fields[rec.field_id] = TransportTypeField.objects.filter(pk=rec.field_id).first()
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
            TransportFieldValue.history.filter(transport_id=obj.id),
            label_fn=lambda rec: (field_of(rec).name if field_of(rec) else "Реквизит"),
            value_fn=fv_value,
            created_at=obj.created_at,
        )
        related_rows += req_rows
        created_extra += req_created

        fv_field_name = dict(
            TransportFieldValue.objects.filter(transport_id=obj.id).values_list("id", "field__name")
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
                TransportFieldFile.history.filter(field_value_id__in=list(fv_field_name)),
                label_fn=lambda rec: fv_field_name.get(rec.field_value_id, "Файл реквизита"),
                value_fn=file_value,
                created_at=obj.created_at,
            )
            related_rows += file_rows
            created_extra += file_created

        cf_rows, cf_created = build_related_history_rows(
            TransportCustomField.history.filter(transport_id=obj.id),
            label_fn=lambda rec: rec.name,
            value_fn=lambda rec: rec.value,
            created_at=obj.created_at,
        )
        related_rows += cf_rows
        created_extra += cf_created

        # Проведённые ТО — отдельная категория «maintenance».
        related_rows += _maintenance_history_rows(obj)

        from core.assignments import acceptance_annotator

        rows = build_history_rows(
            obj, field_specs,
            movement_fields={"employee"},
            movement_events=[{
                "trigger": "is_written_off", "to": True,
                "consume": ["is_written_off", "written_off_at", "employee"],
                "label": "Списано",
            }],
            created_extra_lines=created_extra,
            acceptance_for=acceptance_annotator(obj),
            placement_group={
                "fields": ["employee"],
                "titles": {"employee": "Закрепление за сотрудником"},
                "empty_title": "Открепление",
            },
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
        transport = self.get_object()
        field = get_object_or_404(TransportTypeField, pk=field_id, transport_type=transport.transport_type)
        if field.value_type != "file":
            return Response({"detail": "Реквизит не файлового типа."}, status=400)

        if request.method == "DELETE":
            field_value = TransportFieldValue.objects.filter(transport=transport, field=field).first()
            if field_value and field_value.value_file_id:
                delete_stored_file(field_value.value_file)
                field_value.value_file = None
                field_value.save(update_fields=["value_file"])
            return Response(status=204)

        file_objs = request.FILES.getlist("file")
        if not file_objs:
            return Response({"detail": "Файл не передан."}, status=400)
        for f in file_objs:
            if f.size > 20 * 1024 * 1024:
                return Response({"detail": f"Файл «{f.name}» больше 20 МБ."}, status=400)

        field_value, created = TransportFieldValue.objects.get_or_create(transport=transport, field=field)
        if field.allow_multiple:
            if field_value.value_file_id:
                TransportFieldFile.objects.create(field_value=field_value, stored_file=field_value.value_file)
                field_value.value_file = None
                field_value.save(update_fields=["value_file"])
            for f in file_objs:
                stored = store_uploaded_file(f, "transport/fields")
                TransportFieldFile.objects.create(field_value=field_value, stored_file=stored)
        else:
            stored_file = store_uploaded_file(file_objs[0], "transport/fields")
            if not created:
                delete_stored_file(field_value.value_file)
            field_value.value_file = stored_file
            field_value.save(update_fields=["value_file"])
        return Response(TransportFieldValueOutSerializer(field_value).data)

    @action(
        detail=True,
        methods=["delete"],
        url_path=r"field-values/(?P<field_id>[^/.]+)/files/(?P<file_pk>[^/.]+)",
        permission_classes=[IsAdminOrAccountant],
    )
    def delete_field_file(self, request, pk=None, field_id=None, file_pk=None):
        transport = self.get_object()
        field_file = get_object_or_404(
            TransportFieldFile,
            pk=file_pk,
            field_value__transport=transport,
            field_value__field_id=field_id,
        )
        stored = field_file.stored_file
        field_file.delete()
        delete_stored_file(stored)
        return Response(status=204)


def _fmt_quantity(value):
    q = value.normalize()
    if q == q.to_integral():
        q = q.quantize(1)
    return f"{q}"


def _fmt_date(d):
    return d.strftime("%d.%m.%Y") if d else "—"


def _mileage_unit_label(transport):
    return "моточасов" if transport.transport_type.mileage_unit == "motohours" else "км"


def _maintenance_history_rows(transport):
    """Строки истории по проведённым ТО (category='maintenance')."""
    rows = []
    unit = _mileage_unit_label(transport)
    records = (
        transport.maintenance_records.select_related("created_by").prefetch_related("items").all()
    )
    for rec in records:
        performed_date = timezone.localdate(rec.performed_at)
        if rec.prior_planned_date is not None:
            overdue_days = (performed_date - rec.prior_planned_date).days
            suffix = f" (с просрочкой {overdue_days} дн.)" if overdue_days > 0 else " (вовремя)"
        else:
            suffix = ""
        lines = []
        for item in rec.items.all():
            kind_label = MaintenanceRecordItem.Kind(item.kind).label
            if item.is_cancelled:
                reason = item.cancel_reason or "без причины"
                lines.append({
                    "label": f"{kind_label} «{item.name}» — отменено",
                    "value": f"причина: {reason}",
                    "secret": False,
                })
            else:
                lines.append({
                    "label": f"{kind_label} «{item.name}»",
                    "value": f"количество: {_fmt_quantity(item.quantity)}",
                    "secret": False,
                })
        if rec.mileage is not None:
            lines.append({"label": "Пробег на момент ТО", "value": f"{_fmt_quantity(rec.mileage)} {unit}", "secret": False})
        if rec.next_planned_date:
            lines.append({"label": "Следующее ТО", "value": _fmt_date(rec.next_planned_date), "secret": False})
        title = f"Проведено ТО «{rec.regulation_name}»" if rec.regulation_name else "Проведено внеплановое ТО"
        rows.append({
            "date": rec.performed_at,
            "author": rec.created_by.email if rec.created_by_id else None,
            "kind": "maintenance", "category": "maintenance",
            "label": f"{title}{suffix}",
            "old": None, "new": None, "secret": False,
            "comment": rec.comment or None,
            "lines": lines,
        })
    return rows
