from django.db import transaction
from django.db.models import ProtectedError, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import filters, generics, serializers, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from core.eav import count_missing_for_field
from core.eav_filters import csv_ids, eav_req_conditions
from core.mixins import CreationCommentMixin
from core.pagination import ELECursorPagination
from core.permissions import (
    CanManageMaintenance,
    CanPerformMaintenance,
    EquipmentAccessPermission,
    IsAdminOrAccountant,
    RegulationAccessPermission,
    can_maintain_type,
)
from employees.models import Employee
from storage.service import delete_stored_file, store_uploaded_file

from .maintenance import (
    add_months,
    archive_equipment_maintenance,
    create_plan_for_individual_regulation,
    create_plans_for_type_regulation,
    plan_sort_key,
    plan_status,
    set_regulation_archived,
)
from .models import (
    Equipment,
    EquipmentCustomField,
    EquipmentFieldFile,
    EquipmentFieldValue,
    EquipmentMaintenancePlan,
    EquipmentType,
    EquipmentTypeField,
    MaintenanceRecord,
    MaintenanceRecordItem,
    MaintenanceRegulation,
)
from .serializers import (
    EquipmentFieldValueOutSerializer,
    EquipmentSerializer,
    EquipmentTypeFieldSerializer,
    EquipmentTypeSerializer,
    MaintenanceRegulationSerializer,
    PerformMaintenanceSerializer,
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


class TypeRegulationListView(generics.ListCreateAPIView):
    """B13+. Регламенты ТО типа оборудования (наследуются всем оборудованием
    типа). Создание регламента заводит планы у всего активного оборудования."""

    serializer_class = MaintenanceRegulationSerializer
    permission_classes = [CanManageMaintenance]

    def get_queryset(self):
        return MaintenanceRegulation.objects.filter(equipment_type_id=self.kwargs["type_pk"]).prefetch_related("items")

    def perform_create(self, serializer):
        equipment_type = get_object_or_404(EquipmentType, pk=self.kwargs["type_pk"])
        regulation = serializer.save(equipment_type=equipment_type)
        create_plans_for_type_regulation(regulation)


class TypeRegulationDetailView(generics.RetrieveUpdateAPIView):
    """B13+. Правка регламента типа (поля/позиции) или архив/возврат
    (PATCH is_archived) с каскадом на планы оборудования."""

    serializer_class = MaintenanceRegulationSerializer
    permission_classes = [CanManageMaintenance]

    def get_queryset(self):
        return MaintenanceRegulation.objects.filter(equipment_type_id=self.kwargs["type_pk"]).prefetch_related("items")

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        # Архив/возврат — отдельной операцией (каскад на планы), не через обычный
        # апдейт полей (is_archived в сериализаторе read-only).
        if "is_archived" in request.data and set(request.data.keys()) <= {"is_archived"}:
            set_regulation_archived(instance, bool(request.data["is_archived"]))
            return Response(self.get_serializer(instance).data)
        return super().update(request, *args, **kwargs)


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
            "field_values__field", "field_values__files__stored_file", "custom_fields", "place__employees",
            # B13+: планы+регламенты для сводной индикации ТО (без N+1).
            "maintenance_plans__regulation",
        )
        user = self.request.user
        if user.role == "employee" and not user.is_observer:
            # Не привязан к Сотруднику — не видит ничего, а не «все свободные».
            qs = qs.filter(employee_id=user.employee_id) if user.employee_id else qs.none()

        # B23: роль «Ответственный за ТО» видит в разделе Оборудование только то,
        # с чем работает по ТО (и в списке, и на карточке): при «все типы» — всё
        # оборудование типов с включённым ТО; при ограничении — только выбранные
        # типы. Оборудование типов без ТО ей недоступно. У «Ответственного за
        # учёт» список НЕ сужается — он видит всё, ограничена лишь возможность
        # проведения ТО.
        if user.role == "maintenance":
            if getattr(user, "maintenance_all_types", True):
                qs = qs.filter(equipment_type__maintenance_enabled=True)
            else:
                qs = qs.filter(equipment_type_id__in=user.maintenance_types.values_list("id", flat=True))

        # Фильтры вкладки/статуса/поиска относятся только к списку. Для retrieve
        # и detail-действий их применять нельзя: иначе карточка архивного объекта
        # (tab по умолчанию «active») отдавала бы 404, а фронт вис бы на лоадере.
        if self.action != "list":
            # На карточке (retrieve) отдаём «Номер/ключ» привязанных лицензий —
            # прогреваем field_values, чтобы не ловить N+1 при сериализации.
            return qs.prefetch_related("licenses__field_values__field", "sim_cards")

        tab = self.request.query_params.get("tab", "active")
        qs = qs.filter(is_written_off=(tab == "archive"))

        # Фильтр по сотруднику — блок «Закреплённое оборудование» в Профиле
        # (одиночный id) и «Закреплён за → сотрудник» из модалки фильтров
        # (мультивыбор, id через запятую). Для роли «Сотрудник» список и так
        # сужен до своего (см. выше).
        employee = self.request.query_params.get("employee")
        if employee:
            qs = qs.filter(employee_id__in=csv_ids(employee))

        status_param = self.request.query_params.get("status", "all")
        if status_param == "assigned":
            qs = qs.filter(employee__isnull=False)
        elif status_param == "stationary":
            qs = qs.filter(employee__isnull=True, place__place_type="workplace")
        elif status_param == "free":
            qs = qs.filter(employee__isnull=True).exclude(place__place_type="workplace")

        # B27. Фильтр по Типам (мультивыбор) + реквизитам выбранных Типов.
        type_ids = csv_ids(self.request.query_params.get("type"))
        if type_ids:
            qs = qs.filter(equipment_type_id__in=type_ids)
        for cond in eav_req_conditions(
            self.request.query_params,
            value_model=EquipmentFieldValue,
            field_model=EquipmentTypeField,
            object_fk="equipment",
            type_field="equipment_type",
        ):
            qs = qs.filter(cond)

        # B27. «Закреплён за» → места хранения / рабочие места (мультивыбор).
        place_storage = csv_ids(self.request.query_params.get("place_storage"))
        if place_storage:
            qs = qs.filter(place_id__in=place_storage, place__place_type="storage")
        place_workplace = csv_ids(self.request.query_params.get("place_workplace"))
        if place_workplace:
            qs = qs.filter(place_id__in=place_workplace, place__place_type="workplace")

        # B17: подбор оборудования под установку SIM — только типы с флагом.
        if self.request.query_params.get("allows_sim") == "1":
            qs = qs.filter(equipment_type__allows_sim=True)

        # Подбор оборудования под привязку лицензии — только типы с флагом.
        if self.request.query_params.get("allows_license") == "1":
            qs = qs.filter(equipment_type__allows_license=True)

        # B13+: фильтры по статусу ТО считаются по активным планам (регламент не
        # архивный, план не отменён, регламент не «по потребности»). Можно выбрать
        # несколько сразу — объединяем через OR по наличию подходящего плана.
        to_due = self.request.query_params.get("to_due") == "1"
        to_overdue = self.request.query_params.get("to_overdue") == "1"
        to_unset = self.request.query_params.get("to_unset") == "1"
        if to_due or to_overdue or to_unset:
            from datetime import timedelta

            from django.db.models import Exists, OuterRef

            from equipment.maintenance import DUE_SOON_DAYS

            today = timezone.localdate()
            active = EquipmentMaintenancePlan.objects.filter(
                equipment=OuterRef("pk"),
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
            qs = qs.filter(equipment_type__maintenance_enabled=True).filter(cond)

        search = self.request.query_params.get("search")
        if search:
            # Поиск по Учётному номеру; Типу и Модели; закреплённому Сотруднику
            # (Имя/Фамилия/Должность/Отдел); Рабочему месту (Здание/Помещение/
            # Место) и Складу (Название места хранения — тот же FK place).
            # «Модель» — зафиксированный (is_locked) реквизит Типа, значение в
            # value_text; join по field_values даёт дубли строк — снимаем distinct().
            qs = qs.filter(
                Q(inventory_number__icontains=search)
                | Q(equipment_type__name__icontains=search)
                | Q(field_values__field__is_locked=True, field_values__value_text__icontains=search)
                | Q(employee__first_name__icontains=search)
                | Q(employee__last_name__icontains=search)
                | Q(employee__position__icontains=search)
                | Q(employee__department__icontains=search)
                | Q(place__name__icontains=search)
                | Q(place__room__name__icontains=search)
                | Q(place__room__building__name__icontains=search)
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
        # B13+: списание выводит ТО из обращения — индивидуальные регламенты в
        # архив, планы отменены, даты обнулены (контроль/проведение недоступны).
        archive_equipment_maintenance(equipment)
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

    @action(detail=True, methods=["post"], url_path="maintenance", permission_classes=[CanPerformMaintenance])
    def perform_maintenance(self, request, pk=None):
        """B13+. Провести ТО по регламенту (или «Внеплановое» — regulation=null).
        Создаёт запись MaintenanceRecord со снимком позиций (в т.ч. отменённых с
        причиной) и, для периодического регламента, переносит новую плановую дату
        в план (EquipmentMaintenancePlan)."""
        equipment = self.get_object()
        if not equipment.equipment_type.maintenance_enabled:
            return Response({"detail": "Для этого типа оборудования ТО не ведётся."}, status=409)
        # B23: проверка области типов — вне выбранных типов ТО проводить нельзя.
        if not can_maintain_type(request, equipment.equipment_type_id):
            return Response({"detail": "Проведение ТО для этого типа оборудования вам недоступно."}, status=403)
        if equipment.is_written_off:
            return Response({"detail": "По списанному оборудованию ТО не проводится."}, status=409)

        serializer = PerformMaintenanceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        regulation = data.get("regulation")
        plan = None
        if regulation is not None:
            plan = EquipmentMaintenancePlan.objects.filter(equipment=equipment, regulation=regulation).first()
            if plan is None or plan.is_cancelled or regulation.is_archived:
                return Response({"detail": "Регламент недоступен для этого оборудования."}, status=409)

        # Хотя бы одна неотменённая работа/материал обязательна.
        items = data["items"]
        active_items = [i for i in items if not i["is_cancelled"]]
        if not active_items:
            return Response(
                {"detail": "Добавьте хотя бы одну (неотменённую) работу или материал."}, status=400
            )

        # Дата следующего ТО: обязательна и ограничена для периодического
        # регламента; у «по потребности» и «Внепланового» даты нет.
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
                equipment=equipment,
                regulation=regulation,
                regulation_name=(regulation.name if regulation else ""),
                next_planned_date=next_date,
                prior_planned_date=(plan.next_planned_date if plan else None),
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

        return Response(EquipmentSerializer(equipment, context=self.get_serializer_context()).data)

    @action(detail=True, methods=["get", "post"], url_path="regulations", permission_classes=[RegulationAccessPermission])
    def regulations(self, request, pk=None):
        """B13+. GET — сводный список регламентов оборудования (активные типовые +
        индивидуальные) с планом/статусом, сортировка как у пикера. POST —
        создать индивидуальный регламент (+ план)."""
        equipment = self.get_object()
        if request.method == "POST":
            serializer = MaintenanceRegulationSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            regulation = serializer.save(equipment=equipment)
            create_plan_for_individual_regulation(regulation)
            # Дата первого ТО может задаваться сразу при создании (только для
            # периодического регламента; не раньше сегодня).
            raw_date = request.data.get("next_planned_date")
            if raw_date and not regulation.on_demand:
                date = serializers.DateField().to_internal_value(raw_date)
                if date >= timezone.localdate():
                    regulation.plans.filter(equipment=equipment).update(next_planned_date=date)
            return Response(self._regulation_payload(equipment), status=201)
        return Response(self._regulation_payload(equipment))

    def _regulation_payload(self, equipment):
        """Список регламентов оборудования с планами, отсортированный как пикер."""
        # Активные типовые регламенты его типа + все индивидуальные (в т.ч.
        # архивные — чтобы можно было вернуть из архива).
        regs = list(
            MaintenanceRegulation.objects.filter(
                Q(equipment_type_id=equipment.equipment_type_id, is_archived=False)
                | Q(equipment_id=equipment.id)
            ).prefetch_related("items")
        )
        plans = {
            p.regulation_id: p
            for p in EquipmentMaintenancePlan.objects.filter(equipment=equipment, regulation__in=regs)
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
        # Сортировка как у пикера: overdue→due→scheduled→без даты→по потребности;
        # отменённые для экземпляра/архивные — в конец.
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
        permission_classes=[CanManageMaintenance],
    )
    def regulation_detail(self, request, pk=None, reg_pk=None):
        """B13+. Индивидуальный регламент оборудования: правка (PATCH полей) или
        архив/возврат (PATCH is_archived). Типовые регламенты правятся в редакторе
        Типов — здесь для них доступна только операция плана (см. regulation_plan)."""
        equipment = self.get_object()
        regulation = get_object_or_404(MaintenanceRegulation, pk=reg_pk, equipment=equipment)
        if request.method == "DELETE":
            set_regulation_archived(regulation, True)
            return Response(self._regulation_payload(equipment))
        if "is_archived" in request.data and set(request.data.keys()) <= {"is_archived"}:
            set_regulation_archived(regulation, bool(request.data["is_archived"]))
            return Response(self._regulation_payload(equipment))
        serializer = MaintenanceRegulationSerializer(regulation, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(self._regulation_payload(equipment))

    @action(
        detail=True,
        methods=["patch"],
        url_path=r"regulations/(?P<reg_pk>[^/.]+)/plan",
        permission_classes=[CanManageMaintenance],
    )
    def regulation_plan(self, request, pk=None, reg_pk=None):
        """B13+. Per-equipment действия над планом регламента (типового или
        индивидуального): отмена/возврат для этого оборудования (is_cancelled) и
        установка даты первого/ближайшего ТО (next_planned_date, ≥ сегодня)."""
        equipment = self.get_object()
        regulation = get_object_or_404(
            MaintenanceRegulation,
            Q(equipment_type_id=equipment.equipment_type_id) | Q(equipment=equipment),
            pk=reg_pk,
        )
        plan, _ = EquipmentMaintenancePlan.objects.get_or_create(equipment=equipment, regulation=regulation)
        if regulation.is_archived:
            return Response({"detail": "Регламент в архиве."}, status=409)

        if "is_cancelled" in request.data:
            cancelled = bool(request.data["is_cancelled"])
            plan.is_cancelled = cancelled
            # Отмена для экземпляра снимает плановую дату; возврат — заново назначить.
            plan.next_planned_date = None
            plan.save(update_fields=["is_cancelled", "next_planned_date"])
            return Response(self._regulation_payload(equipment))

        if "next_planned_date" in request.data:
            if plan.is_cancelled:
                return Response({"detail": "Регламент отменён для этого оборудования."}, status=409)
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
            return Response(self._regulation_payload(equipment))

        return Response({"detail": "Нет изменений."}, status=400)

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

            p = Place.objects.select_related("room__building").filter(pk=v).first()
            if not p:
                return "—"
            kind = "Рабочее место" if p.place_type == Place.PlaceType.WORKPLACE else "Место хранения"
            return f"{kind} «{p.name}» ({p.room.building.name} — {p.room.name})"

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

        # B13. Проведённые ТО — отдельная категория «maintenance» (фильтр
        # «Выполненные ТО»). Записи собственной simple-history не имеют —
        # разворачиваем прямо из MaintenanceRecord.
        related_rows += _maintenance_history_rows(eq)

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


def _fmt_quantity(value):
    """Decimal без хвостовых нулей: 2.000 → «2», 2.500 → «2.5»."""
    q = value.normalize()
    # normalize() у целых даёт экспоненту (2E+1) — приводим к обычной записи.
    if q == q.to_integral():
        q = q.quantize(1)
    return f"{q}"


def _fmt_date(d):
    return d.strftime("%d.%m.%Y") if d else "—"


def _maintenance_history_rows(equipment):
    """Строки истории по проведённым ТО (category='maintenance')."""
    rows = []
    records = (
        equipment.maintenance_records.select_related("created_by").prefetch_related("items").all()
    )
    for rec in records:
        performed_date = timezone.localdate(rec.performed_at)
        # Отметка «вовремя / с просрочкой N дней» — только если была плановая дата.
        if rec.prior_planned_date is not None:
            overdue_days = (performed_date - rec.prior_planned_date).days
            suffix = f" (с просрочкой {overdue_days} дн.)" if overdue_days > 0 else " (вовремя)"
        else:
            suffix = ""
        lines = []
        for item in rec.items.all():
            kind_label = MaintenanceRecordItem.Kind(item.kind).label
            if item.is_cancelled:
                # Отменённая позиция регламента: причина отмены в истории.
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
        if rec.next_planned_date:
            lines.append({"label": "Следующее ТО", "value": _fmt_date(rec.next_planned_date), "secret": False})
        # Заголовок: имя регламента (снимок) либо «внеплановое».
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
