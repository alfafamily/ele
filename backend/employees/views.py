from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import filters, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import BasePermission
from rest_framework.response import Response
from rest_framework.views import APIView

from core.mixins import CreationCommentMixin
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
        # Вкладки списка: Работают / Уволены.
        employment = self.request.query_params.get("employment")
        if employment == "working":
            qs = qs.filter(is_employed=True)
        elif employment == "terminated":
            qs = qs.filter(is_employed=False)
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
        """Увольнение (E3): отвязывает всё оборудование, обрабатывает выданные
        SIM-карты и пропуска по выбору пользователя (открепить / утилизировать /
        передать арендодателю), опционально деактивирует связанного Пользователя.

        sim_actions / pass_actions — словари {id: {"action": ..., "comment": ...}}.
        action: 'detach' (по умолчанию) | 'utilized' | 'handed' (только пропуска).
        """
        from django.utils import timezone

        employee = self.get_object()
        equipment_list = list(employee.equipment.all())
        for eq in equipment_list:
            # По одной, не bulk .update() — иначе не сработает история.
            eq.employee = None
            eq.save(update_fields=["employee"])

        sim_actions = request.data.get("sim_actions") or {}
        pass_actions = request.data.get("pass_actions") or {}

        # SIM-карты — переиспользуемые объекты: открепляем (⇒ «Неиспользуемые») или
        # утилизируем по выбору. По одной, не bulk — иначе не сработает история.
        active_sims = list(employee.sim_cards.all())
        utilized_sim_count = 0
        for sim in active_sims:
            spec = sim_actions.get(str(sim.id)) or {}
            sim.employee = None
            if spec.get("action") == "utilized":
                sim.is_utilized = True
                sim.utilized_at = timezone.now()
                utilized_sim_count += 1
                comment = (spec.get("comment") or "").strip()
                if comment:
                    sim._change_reason = comment
                sim.save(update_fields=["employee", "is_utilized", "utilized_at"])
            else:
                sim.save(update_fields=["employee"])

        active_passes = list(employee.passes.all())
        utilized_pass_count = 0
        reason_map = {c[0] for c in AccessPass.UtilizationReason.choices}
        for ap in active_passes:
            spec = pass_actions.get(str(ap.id)) or {}
            action = spec.get("action")
            ap.employee = None
            if action in reason_map:
                ap.is_utilized = True
                ap.utilized_at = timezone.now()
                ap.utilization_reason = action
                utilized_pass_count += 1
                comment = (spec.get("comment") or "").strip()
                if comment:
                    ap._change_reason = comment
                ap.save(update_fields=["employee", "is_utilized", "utilized_at", "utilization_reason"])
            else:
                ap.save(update_fields=["employee"])

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
        data["deactivated_sim_count"] = len(active_sims) - utilized_sim_count
        data["utilized_sim_count"] = utilized_sim_count
        data["deactivated_pass_count"] = len(active_passes) - utilized_pass_count
        data["utilized_pass_count"] = utilized_pass_count
        data["deactivated_user"] = deactivated_user
        return Response(data)

    @action(detail=True, methods=["post"])
    def restore(self, request, pk=None):
        """Восстановление уволенного сотрудника: снова «Работает». Привязки
        SIM/оборудования/пропусков при увольнении были сняты — не возвращаем."""
        employee = self.get_object()
        if not employee.is_employed:
            employee.is_employed = True
            employee.save(update_fields=["is_employed"])
        return Response(EmployeeSerializer(employee).data)

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


class SimCardViewSet(CreationCommentMixin, viewsets.ModelViewSet):
    """Корпоративные SIM/E-SIM — самостоятельный раздел (admin/accountant).
    Сотрудник видит только свои номера в Профиле (read-only). Статус — по
    привязке: закреплена ⇒ активна, отвязана ⇒ деактивирована.
    См. SimCardAccessPermission."""

    permission_classes = [SimCardAccessPermission]
    serializer_class = SimCardSerializer
    pagination_class = ELECursorPagination
    filter_backends = [filters.OrderingFilter]
    ordering_fields = ["phone_number", "network_operator", "provider", "created_at"]
    ordering = ["-created_at"]

    def get_queryset(self):
        qs = SimCard.objects.select_related("employee").all()
        user = self.request.user
        if user.role == "employee":
            # Только свои номера (Наблюдатель не расширяет доступ к SIM);
            # не привязан к Сотруднику — не видит ничего.
            return qs.filter(employee_id=user.employee_id) if user.employee_id else qs.none()
        employee = self.request.query_params.get("employee")
        if employee:
            qs = qs.filter(employee_id=employee)

        if self.action == "list":
            # Вкладки раздела: Активные (привязаны) / Неиспользуемые (отвязаны, не
            # утилизированы) / Утилизировано (необратимо).
            tab = self.request.query_params.get("tab")
            if tab == "active":
                qs = qs.filter(employee__isnull=False, is_utilized=False)
            elif tab == "deactivated":
                qs = qs.filter(employee__isnull=True, is_utilized=False)
            elif tab == "utilized":
                qs = qs.filter(is_utilized=True)
            search = self.request.query_params.get("search")
            if search:
                qs = qs.filter(
                    Q(phone_number__icontains=search)
                    | Q(network_operator__icontains=search)
                    | Q(provider__icontains=search)
                )
        return qs

    @action(detail=True, methods=["post"], permission_classes=[IsAdminOrAccountant])
    def detach(self, request, pk=None):
        """Отвязать от сотрудника (деактивировать). Объект остаётся для истории
        и повторной выдачи."""
        sim = self.get_object()
        if sim.employee_id is not None:
            sim.employee = None
            sim.save(update_fields=["employee"])
        return Response(SimCardSerializer(sim).data)

    @action(detail=True, methods=["post"], permission_classes=[IsAdminOrAccountant])
    def attach(self, request, pk=None):
        """Привязать к сотруднику (активировать)."""
        sim = self.get_object()
        employee = get_object_or_404(Employee, pk=request.data.get("employee"))
        sim.employee = employee
        sim.save(update_fields=["employee"])
        return Response(SimCardSerializer(sim).data)

    @action(detail=True, methods=["post"], permission_classes=[IsAdminOrAccountant])
    def utilize(self, request, pk=None):
        """Утилизировать SIM — необратимый статус. Отвязывает от сотрудника и
        переводит в таб «Утилизировано». Комментарий (необязательный) попадает в
        историю движений."""
        from django.utils import timezone

        sim = self.get_object()
        if not sim.is_utilized:
            sim.employee = None
            sim.is_utilized = True
            sim.utilized_at = timezone.now()
            comment = (request.data.get("comment") or "").strip()
            if comment:
                sim._change_reason = comment
            sim.save(update_fields=["employee", "is_utilized", "utilized_at"])
        return Response(SimCardSerializer(sim).data)

    @action(detail=True, methods=["get"], url_path="history")
    def history_list(self, request, pk=None):
        from core.history import build_history_rows

        sim = self.get_object()

        def fmt_employee(v):
            if not v:
                return "Не закреплена"
            emp = Employee.objects.filter(pk=v).first()
            return str(emp) if emp else "—"

        def fmt_sim_type(v):
            return dict(SimCard.SimType.choices).get(v, v or "—")

        field_specs = {
            "phone_number": {"label": "Номер телефона"},
            "sim_type": {"label": "Тип", "format": fmt_sim_type},
            "network_operator": {"label": "Оператор"},
            "provider": {"label": "Поставщик услуг связи"},
            "employee": {"label": "Закреплена за", "format": fmt_employee, "in_created": False},
        }
        rows = build_history_rows(
            sim, field_specs,
            movement_fields={"employee"},
            movement_events=[{
                "trigger": "is_utilized", "to": True,
                "consume": ["is_utilized", "utilized_at", "employee"],
                "label": "Утилизирована",
            }],
        )
        rows.sort(key=lambda r: r["date"], reverse=True)
        return Response(rows)

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


class AccessPassViewSet(CreationCommentMixin, viewsets.ModelViewSet):
    """Пропуска СКУД — самостоятельный раздел (admin/accountant). Сотрудник видит
    только свои пропуска в Профиле (read-only). Статус — по привязке.
    Механика 1:1 как у SimCardViewSet. См. AccessPassAccessPermission."""

    permission_classes = [AccessPassAccessPermission]
    serializer_class = AccessPassSerializer
    pagination_class = ELECursorPagination
    filter_backends = [filters.OrderingFilter]
    ordering_fields = ["name", "account_number", "created_at"]
    ordering = ["-created_at"]

    def get_queryset(self):
        qs = AccessPass.objects.select_related("employee").prefetch_related("buildings", "rooms")
        user = self.request.user
        if user.role == "employee":
            # Только свои пропуска; не привязан к Сотруднику — не видит ничего.
            return qs.filter(employee_id=user.employee_id) if user.employee_id else qs.none()
        employee = self.request.query_params.get("employee")
        if employee:
            qs = qs.filter(employee_id=employee)

        if self.action == "list":
            # Активные / Неиспользуемые (отвязаны, не утилизированы) / Утилизировано.
            tab = self.request.query_params.get("tab")
            if tab == "active":
                qs = qs.filter(employee__isnull=False, is_utilized=False)
            elif tab == "deactivated":
                qs = qs.filter(employee__isnull=True, is_utilized=False)
            elif tab == "utilized":
                qs = qs.filter(is_utilized=True)
            search = self.request.query_params.get("search")
            if search:
                qs = qs.filter(
                    Q(name__icontains=search) | Q(account_number__icontains=search)
                )
        return qs

    @action(detail=True, methods=["post"], permission_classes=[IsAdminOrAccountant])
    def detach(self, request, pk=None):
        """Отвязать от сотрудника (деактивировать). Остаётся для истории и
        повторной выдачи."""
        access_pass = self.get_object()
        if access_pass.employee_id is not None:
            access_pass.employee = None
            access_pass.save(update_fields=["employee"])
        return Response(AccessPassSerializer(access_pass).data)

    @action(detail=True, methods=["post"], permission_classes=[IsAdminOrAccountant])
    def attach(self, request, pk=None):
        """Привязать к сотруднику (активировать)."""
        access_pass = self.get_object()
        employee = get_object_or_404(Employee, pk=request.data.get("employee"))
        access_pass.employee = employee
        access_pass.save(update_fields=["employee"])
        return Response(AccessPassSerializer(access_pass).data)

    @action(detail=True, methods=["post"], permission_classes=[IsAdminOrAccountant])
    def utilize(self, request, pk=None):
        """Утилизировать пропуск/ключ — необратимый статус. reason:
        utilized (выброшен) | handed (передан арендодателю). Отвязывает от
        сотрудника, переводит в таб «Утилизировано». Комментарий (необязательный)
        попадает в историю движений."""
        from django.utils import timezone

        access_pass = self.get_object()
        reason = request.data.get("reason")
        valid = {c[0] for c in AccessPass.UtilizationReason.choices}
        if reason not in valid:
            return Response({"detail": "Некорректная причина утилизации."}, status=400)
        if not access_pass.is_utilized:
            access_pass.employee = None
            access_pass.is_utilized = True
            access_pass.utilized_at = timezone.now()
            access_pass.utilization_reason = reason
            comment = (request.data.get("comment") or "").strip()
            if comment:
                access_pass._change_reason = comment
            access_pass.save(update_fields=["employee", "is_utilized", "utilized_at", "utilization_reason"])
        return Response(AccessPassSerializer(access_pass).data)

    @action(detail=True, methods=["get"], url_path="history")
    def history_list(self, request, pk=None):
        from core.history import build_history_rows

        access_pass = self.get_object()

        def fmt_employee(v):
            if not v:
                return "Не закреплён"
            emp = Employee.objects.filter(pk=v).first()
            return str(emp) if emp else "—"

        yes_no = lambda v: "Да" if v else "Нет"
        fmt_object_type = lambda v: dict(AccessPass.ObjectType.choices).get(v, v or "—")

        def utilize_label(record):
            reason = record.utilization_reason
            return dict(AccessPass.UtilizationReason.choices).get(reason, "Утилизирован")

        field_specs = {
            "object_type": {"label": "Тип объекта", "format": fmt_object_type},
            "name": {"label": "Название"},
            "account_number": {"label": "Учётный номер"},
            "type_vehicle": {"label": "Тип «Авто»", "format": yes_no},
            "type_pedestrian": {"label": "Тип «Пеший»", "format": yes_no},
            "employee": {"label": "Закреплён за", "format": fmt_employee, "in_created": False},
        }
        rows = build_history_rows(
            access_pass, field_specs,
            movement_fields={"employee"},
            movement_events=[{
                "trigger": "is_utilized", "to": True,
                "consume": ["is_utilized", "utilized_at", "utilization_reason", "employee"],
                "label": utilize_label,
            }],
        )
        rows.sort(key=lambda r: r["date"], reverse=True)
        return Response(rows)


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
