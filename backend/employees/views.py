from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import filters, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.mixins import CreationCommentMixin
from core.pagination import ELECursorPagination
from core.permissions import (
    AccessPassAccessPermission,
    IsAdminOrAccountant,
    IsAdminOrAccountantOrReadOnlyObserver,
    SimCardAccessPermission,
)
from storage.service import delete_stored_file, store_uploaded_file
from storage.validators import validate_image_max_dimensions

from .models import AccessPass, Employee, SimCard
from .serializers import (
    AccessPassSerializer,
    EmployeeListSerializer,
    EmployeeSerializer,
    SimCardSerializer,
)


def _norm(s):
    # Нормализация для сопоставления типов: нижний регистр без дефисов/пробелов.
    return s.lower().replace("-", "").replace(" ", "")


def _type_code_match(search, choices, field):
    """Q по кодовому полю-типу (choices) через отображаемую метку. Терпимо к
    неполному вводу и дефисам: запрос сопоставляется с меткой в обе стороны
    (напр. «E-SIM» → esim, «e» → E-SIM). Пустой результат — Q(), no-op."""
    q = Q()
    term = _norm(search)
    if not term:
        return q
    for code, label in choices:
        lab = _norm(str(label))
        if lab and (lab.startswith(term) or term.startswith(lab)):
            q |= Q(**{field: code})
    return q


class EmployeeViewSet(viewsets.ModelViewSet):
    # Наблюдатель видит раздел «Сотрудники» на просмотр; управление и служебные
    # экшены (departments/positions/avatar/terminate/restore) — admin/accountant.
    permission_classes = [IsAdminOrAccountantOrReadOnlyObserver]
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
            "tool_allocations__tool",
            "sim_cards",
            "passes__buildings",
            "passes__rooms",
            "passes__places__room",
            # Объекты, стоящие на рабочих местах сотрудника (для карточки).
            "workplaces__room__building",
            "workplaces__equipment__equipment_type",
            "workplaces__equipment__field_values__field",
            "workplaces__tool_allocations__tool",
        )
        # Вкладки списка: Работают / Уволены.
        employment = self.request.query_params.get("employment")
        if employment == "working":
            qs = qs.filter(is_employed=True)
        elif employment == "terminated":
            qs = qs.filter(is_employed=False)
        search = self.request.query_params.get("search")
        if search:
            # Поиск по Фамилии, Имени, Должности и Отделу.
            qs = qs.filter(
                Q(first_name__icontains=search)
                | Q(last_name__icontains=search)
                | Q(position__icontains=search)
                | Q(department__icontains=search)
            )
        return qs

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.equipment.exists():
            return Response({"detail": "Нельзя удалить сотрудника — за ним закреплено оборудование."}, status=409)
        if instance.tool_allocations.exists():
            return Response({"detail": "Нельзя удалить сотрудника — за ним закреплены инструменты."}, status=409)
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def terminate(self, request, pk=None):
        """Увольнение (E3): по каждому закреплённому объекту (оборудование,
        инструменты, SIM/E-SIM, пропуска/ключи) переносит его на выбранный склад
        назначения; для SIM и пропусков возможна ещё и утилизация / передача
        арендодателю. Сотрудник снимается со всех рабочих мест. Опционально
        деактивирует связанного Пользователя.

        *_actions — словари {id: {...}}. Для equipment/tools: {"storage_place"}.
        Для sim/pass: {"action", "comment", "storage_place"}; action: 'detach'
        (по умолчанию) | 'utilized' | 'handed' (только пропуска). storage_place
        (место хранения) ОБЯЗАТЕЛЕН для перемещаемых на хранение объектов; не
        требуется только для E-SIM и при утилизации/передаче. Ключ tool_actions —
        id инструмента (карточки), а не размещения. Экшен атомарен: если склад
        где-то не указан — 400 без частичного увольнения.
        """
        from django.utils import timezone

        from core.placement import get_storage_place
        from tools.models import ToolAllocation, ToolMovement

        employee = self.get_object()

        # B26: при увольнении каждый перемещаемый объект переезжает на выбранный
        # склад (место хранения) — он обязателен. Ключи словарей — id объекта;
        # значение — {storage_place, action, comment}.
        equipment_actions = request.data.get("equipment_actions") or {}
        tool_actions = request.data.get("tool_actions") or {}
        sim_actions = request.data.get("sim_actions") or {}
        pass_actions = request.data.get("pass_actions") or {}
        reason_map = {c[0] for c in AccessPass.UtilizationReason.choices}

        def req_storage(spec, field):
            """Обязательный склад назначения (400, если не указан/неподходящий)."""
            return get_storage_place((spec or {}).get("storage_place"), field=field)

        # Резолвим все склады ДО мутаций (экшен ещё и @transaction.atomic) — ошибка
        # «склад не указан» не оставит частично уволенного сотрудника.
        equipment_list = list(employee.equipment.all())
        eq_storage = {
            eq.id: req_storage(equipment_actions.get(str(eq.id)), f"equipment_{eq.id}")
            for eq in equipment_list
        }
        tool_allocations = list(employee.tool_allocations.all())
        tool_storage = {
            a.tool_id: req_storage(tool_actions.get(str(a.tool_id)), f"tool_{a.tool_id}")
            for a in tool_allocations
        }
        active_sims = list(employee.sim_cards.all())
        sim_storage = {}
        for sim in active_sims:
            spec = sim_actions.get(str(sim.id)) or {}
            # Склад нужен только при откреплении обычной SIM: E-SIM виртуальна,
            # утилизируемая карта на склад не переезжает.
            if spec.get("action") != "utilized" and sim.sim_type != "esim":
                sim_storage[sim.id] = req_storage(spec, f"sim_{sim.id}")
        active_passes = list(employee.passes.all())
        pass_storage = {}
        for ap in active_passes:
            spec = pass_actions.get(str(ap.id)) or {}
            # Склад нужен только при откреплении (утилизация/передача — не переезд).
            if spec.get("action") not in reason_map:
                pass_storage[ap.id] = req_storage(spec, f"pass_{ap.id}")

        utilized_sim_count = 0
        utilized_pass_count = 0

        for eq in equipment_list:
            # По одной, не bulk .update() — иначе не сработает история.
            eq.employee = None
            eq.place = eq_storage[eq.id]
            eq.save(update_fields=["employee", "place"])

        # Инструменты возвращаем в свободный остаток на выбранном складе; по
        # каждому — движение «Открепление».
        for alloc in tool_allocations:
            storage = tool_storage[alloc.tool_id]
            dest, _ = ToolAllocation.objects.get_or_create(
                tool=alloc.tool, place=storage, defaults={"quantity": 0}
            )
            dest.quantity += alloc.quantity
            dest.save(update_fields=["quantity"])
            ToolMovement.objects.create(
                tool=alloc.tool,
                kind=ToolMovement.Kind.UNASSIGN,
                quantity=alloc.quantity,
                employee=employee,
                storage_place=storage,
                created_by=request.user if request.user.is_authenticated else None,
            )
            alloc.delete()

        # SIM-карты — переиспользуемые: открепляем на склад (⇒ «Неиспользуемые»,
        # E-SIM — без склада) или утилизируем. По одной, не bulk — ради истории.
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
                sim.storage_place = sim_storage.get(sim.id)  # None только для E-SIM
                sim.save(update_fields=["employee", "storage_place"])

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
                ap.storage_place = pass_storage[ap.id]
                ap.save(update_fields=["employee", "storage_place"])

        # B26: снимаем сотрудника со всех рабочих мест (M2M) — по одному, чтобы
        # сработала m2m-история Места.
        detached_workplaces = list(employee.workplaces.all())
        for wp in detached_workplaces:
            wp.employees.remove(employee)

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
        data["detached_tool_count"] = len(tool_allocations)
        data["detached_workplace_count"] = len(detached_workplaces)
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

    @action(detail=True, methods=["get"], url_path="issued-archive")
    def issued_archive(self, request, pk=None):
        """Архив выданного: по истории (django-simple-history) собираем
        ЗАВЕРШЁННЫЕ эпизоды владения — объекты (оборудование/SIM/пропуска),
        которые были закреплены за сотрудником и позднее откреплены любым
        способом (открепление, увольнение, утилизация/списание, передача
        другому). Текущие (незакрытые) привязки — на вкладке «Выдано»,
        в архив не попадают.

        Отдельной модели/полей не требуется: даты и владельцы уже пишутся в
        исторические таблицы. Здесь только реконструкция пар «прикреплён →
        откреплён» (переход employee_id к сотруднику = закрепление, от него —
        в т.ч. в NULL/другого/при удалении — открепление) и сортировка по дате
        открепления (свежие выше). Один объект может дать несколько эпизодов
        (повторные выдачи).
        """
        from equipment.models import Equipment
        from equipment.serializers import EquipmentMiniSerializer
        from tools.models import Tool, ToolMovement

        employee = self.get_object()
        eid = employee.id

        def episodes(history_manager):
            out = []  # (object_id, attached_at, detached_at, last_record)
            obj_ids = set(history_manager.filter(employee_id=eid).values_list("id", flat=True))
            for oid in obj_ids:
                recs = list(history_manager.filter(id=oid).order_by("history_date", "history_id"))
                prev_here = False
                attached_at = None
                for r in recs:
                    here = r.employee_id == eid and r.history_type != "-"
                    if here and not prev_here:
                        attached_at = r.history_date
                    elif prev_here and not here:
                        out.append((oid, attached_at, r.history_date, r))
                        attached_at = None
                    prev_here = here
            return out

        results = []

        # Оборудование
        eq_eps = episodes(Equipment.history)
        eq_map = {
            e.id: e
            for e in Equipment.objects.filter(id__in=[o for o, *_ in eq_eps])
            .select_related("equipment_type")
            .prefetch_related("field_values__field")
        }
        for oid, att, det, snap in eq_eps:
            obj = eq_map.get(oid)
            if obj is not None:
                data, exists = EquipmentMiniSerializer(obj).data, True
            else:
                data = {"id": oid, "inventory_number": snap.inventory_number, "type_and_model": snap.inventory_number}
                exists = False
            results.append({"kind": "equipment", "object": data, "exists": exists, "attached_at": att, "detached_at": det})

        # Инструменты (количественные): у поштучных выдач нет employee_id на самой
        # карточке — эпизоды реконструируем по журналу движений. Для пары
        # (инструмент, сотрудник) проигрываем assign/unassign: баланс 0→N — начало
        # владения, N→0 — завершённый эпизод (уходит в архив). Текущий ненулевой
        # баланс — это вкладка «Выдано», в архив не попадает.
        tool_moves = list(
            ToolMovement.objects.filter(
                employee_id=eid,
                kind__in=[ToolMovement.Kind.ASSIGN, ToolMovement.Kind.UNASSIGN],
            )
            .select_related("tool")
            .order_by("tool_id", "created_at", "id")
        )
        by_tool = {}
        for m in tool_moves:
            by_tool.setdefault(m.tool_id, []).append(m)
        for recs in by_tool.values():
            tool = recs[0].tool
            balance = peak = 0
            attached_at = None
            for m in recs:
                if m.kind == ToolMovement.Kind.ASSIGN:
                    if balance == 0:
                        attached_at = m.created_at
                        peak = 0
                    balance += m.quantity
                    peak = max(peak, balance)
                else:
                    balance -= m.quantity
                    if balance <= 0:
                        results.append({
                            "kind": "tool",
                            "object": {"id": tool.id, "name": tool.name, "type_and_model": tool.name, "quantity": peak},
                            "exists": not tool.is_written_off,
                            "attached_at": attached_at, "detached_at": m.created_at,
                        })
                        balance = peak = 0
                        attached_at = None

        # SIM/E-SIM
        sim_eps = episodes(SimCard.history)
        sim_map = {s.id: s for s in SimCard.objects.filter(id__in=[o for o, *_ in sim_eps]).select_related("employee")}
        sim_type_labels = dict(SimCard.SimType.choices)
        for oid, att, det, snap in sim_eps:
            obj = sim_map.get(oid)
            if obj is not None:
                data, exists = SimCardSerializer(obj).data, True
            else:
                data = {
                    "id": oid,
                    "phone_number": snap.phone_number,
                    "sim_type": snap.sim_type,
                    "sim_type_display": sim_type_labels.get(snap.sim_type, snap.sim_type or "—"),
                    "network_operator": snap.network_operator,
                    "provider": snap.provider,
                }
                exists = False
            results.append({"kind": "sim", "object": data, "exists": exists, "attached_at": att, "detached_at": det})

        # Пропуска/ключи
        pass_eps = episodes(AccessPass.history)
        pass_map = {
            p.id: p
            for p in AccessPass.objects.filter(id__in=[o for o, *_ in pass_eps]).prefetch_related(
                "buildings", "rooms", "places__room"
            )
        }
        pass_type_labels = dict(AccessPass.ObjectType.choices)
        for oid, att, det, snap in pass_eps:
            obj = pass_map.get(oid)
            if obj is not None:
                data, exists = AccessPassSerializer(obj).data, True
            else:
                data = {
                    "id": oid,
                    "object_type": snap.object_type,
                    "object_type_display": pass_type_labels.get(snap.object_type, snap.object_type or "—"),
                    "account_number": snap.account_number,
                    "type_vehicle": snap.type_vehicle,
                    "type_pedestrian": snap.type_pedestrian,
                    "buildings": [],
                    "rooms": [],
                    "places": [],
                }
                exists = False
            results.append({"kind": "pass", "object": data, "exists": exists, "attached_at": att, "detached_at": det})

        results.sort(key=lambda r: r["detached_at"], reverse=True)
        return Response(results)


class SimCardViewSet(CreationCommentMixin, viewsets.ModelViewSet):
    """Корпоративные SIM/E-SIM — самостоятельный раздел (admin/accountant).
    Сотрудник видит только свои номера в Профиле (read-only). Статус — по
    привязке: закреплена ⇒ активна, отвязана ⇒ деактивирована.
    См. SimCardAccessPermission."""

    permission_classes = [SimCardAccessPermission]
    serializer_class = SimCardSerializer
    pagination_class = ELECursorPagination
    filter_backends = [filters.OrderingFilter]
    ordering_fields = ["phone_number", "network_operator", "provider", "employee__last_name", "created_at"]
    ordering = ["-created_at"]

    def get_queryset(self):
        qs = SimCard.objects.select_related(
            "employee", "employee__avatar", "equipment__equipment_type", "storage_place__room__building"
        ).all()
        user = self.request.user
        if user.role == "employee" and not user.is_observer:
            # Обычный «Сотрудник» — только свои номера (в Профиле); не привязан к
            # Сотруднику — не видит ничего. Наблюдатель видит весь раздел (ниже).
            return qs.filter(employee_id=user.employee_id) if user.employee_id else qs.none()
        employee = self.request.query_params.get("employee")
        if employee:
            qs = qs.filter(employee_id=employee)

        if self.action == "list":
            # Вкладки раздела: Активные (все неутилизированные — и привязанные, и
            # отвязанные) / Утилизировано (необратимо). Внутри «Активных» доступен
            # фильтр status: attached (Активные — за сотрудником) / free
            # (Неактивные — без сотрудника). Значение tab=deactivated сохранено
            # для подбора свободных SIM при привязке (AttachOrCreateModal).
            tab = self.request.query_params.get("tab")
            if tab == "active":
                qs = qs.filter(is_utilized=False)
                status = self.request.query_params.get("status")
                if status == "attached":
                    # В использовании — за сотрудником или в оборудовании.
                    qs = qs.filter(Q(employee__isnull=False) | Q(equipment__isnull=False))
                elif status == "free":
                    qs = qs.filter(employee__isnull=True, equipment__isnull=True)
            elif tab == "deactivated":
                # Свободные для повторной выдачи: без сотрудника и без оборудования.
                qs = qs.filter(employee__isnull=True, equipment__isnull=True, is_utilized=False)
            elif tab == "utilized":
                qs = qs.filter(is_utilized=True)
            search = self.request.query_params.get("search")
            if search:
                # Поиск по Номеру, Поставщику, Оператору, Типу (SIM/E-SIM),
                # Названию места хранения; закреплённому Сотруднику (Фамилия/Имя/
                # Должность/Отдел) и Оборудованию (Тип, Модель, Учётный номер).
                # «Модель» — is_locked-реквизит Типа оборудования; join по
                # equipment__field_values даёт дубли — снимаем distinct().
                cond = (
                    Q(phone_number__icontains=search)
                    | Q(network_operator__icontains=search)
                    | Q(provider__icontains=search)
                    | Q(storage_place__name__icontains=search)
                    | Q(employee__last_name__icontains=search)
                    | Q(employee__first_name__icontains=search)
                    | Q(employee__position__icontains=search)
                    | Q(employee__department__icontains=search)
                    | Q(equipment__equipment_type__name__icontains=search)
                    | Q(
                        equipment__field_values__field__is_locked=True,
                        equipment__field_values__value_text__icontains=search,
                    )
                    | Q(equipment__inventory_number__icontains=search)
                )
                # Тип хранится кодом (sim/esim), а отображается как «SIM»/«E-SIM».
                # Сопоставляем по метке, убрав дефис/пробел, с учётом неполного
                # ввода в обе стороны (запрос «E-SIM» → esim, «e» → E-SIM).
                cond |= _type_code_match(search, SimCard.SimType.choices, "sim_type")
                qs = qs.filter(cond).distinct()
        return qs

    @action(detail=True, methods=["post"], permission_classes=[IsAdminOrAccountant])
    def detach(self, request, pk=None):
        """Открепить (от сотрудника или оборудования). Физическая SIM уходит на
        склад (место хранения обязательно); E-SIM виртуальна — склад не
        указывается. Остаётся для истории и повторной выдачи."""
        from core.placement import get_storage_place

        sim = self.get_object()
        sp = request.data.get("storage_place")
        if sim.sim_type == SimCard.SimType.ESIM:
            storage = get_storage_place(sp) if sp else None
        else:
            storage = get_storage_place(sp)
        sim.employee = None
        sim.equipment = None
        sim.storage_place = storage
        comment = (request.data.get("comment") or "").strip()
        if comment:
            sim._change_reason = comment
        sim.save(update_fields=["employee", "equipment", "storage_place"])
        return Response(SimCardSerializer(sim).data)

    @action(detail=True, methods=["post"], permission_classes=[IsAdminOrAccountant])
    def attach(self, request, pk=None):
        """Разместить SIM: mode=employee — за сотрудником; mode=equipment — в
        оборудовании (симка в модеме). Прежнее размещение очищается."""
        sim = self.get_object()
        mode = request.data.get("mode", "employee")
        if mode == "equipment":
            from equipment.models import Equipment

            equipment = get_object_or_404(Equipment, pk=request.data.get("equipment"))
            # B17: SIM можно установить только в оборудование с флагом типа.
            if not equipment.equipment_type.allows_sim:
                return Response(
                    {"detail": "В этот тип оборудования нельзя устанавливать SIM/E-SIM."}, status=400
                )
            sim.equipment = equipment
            sim.employee = None
        else:
            employee = get_object_or_404(Employee, pk=request.data.get("employee"))
            sim.employee = employee
            sim.equipment = None
        sim.storage_place = None
        comment = (request.data.get("comment") or "").strip()
        if comment:
            sim._change_reason = comment
        sim.save(update_fields=["employee", "equipment", "storage_place"])
        return Response(SimCardSerializer(sim).data)

    @action(detail=True, methods=["post"], permission_classes=[IsAdminOrAccountant])
    def utilize(self, request, pk=None):
        """Утилизировать SIM — необратимый статус. Снимает любое размещение и
        переводит в таб «Утилизировано». Комментарий (необязательный) попадает в
        историю движений."""
        from django.utils import timezone

        sim = self.get_object()
        if not sim.is_utilized:
            sim.employee = None
            sim.equipment = None
            sim.storage_place = None
            sim.is_utilized = True
            sim.utilized_at = timezone.now()
            comment = (request.data.get("comment") or "").strip()
            if comment:
                sim._change_reason = comment
            sim.save(update_fields=["employee", "equipment", "storage_place", "is_utilized", "utilized_at"])
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

        def fmt_equipment(v):
            if not v:
                return "—"
            from equipment.models import Equipment

            eq = Equipment.objects.filter(pk=v).first()
            return str(eq) if eq else "—"

        def fmt_storage(v):
            if not v:
                return "—"
            from locations.models import Place

            p = Place.objects.select_related("room__building").filter(pk=v).first()
            return f"Место хранения «{p.name}» ({p.room.building.name} — {p.room.name})" if p else "—"

        field_specs = {
            "phone_number": {"label": "Номер телефона"},
            "sim_type": {"label": "Тип", "format": fmt_sim_type},
            "network_operator": {"label": "Оператор"},
            "provider": {"label": "Поставщик услуг связи"},
            "employee": {"label": "Закреплена за", "format": fmt_employee, "in_created": False},
            "equipment": {"label": "В оборудовании", "format": fmt_equipment, "in_created": False},
            "storage_place": {"label": "Место хранения", "format": fmt_storage, "in_created": False},
        }
        rows = build_history_rows(
            sim, field_specs,
            movement_fields={"employee", "equipment", "storage_place"},
            movement_events=[{
                "trigger": "is_utilized", "to": True,
                "consume": ["is_utilized", "utilized_at", "employee", "equipment", "storage_place"],
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
    ordering_fields = ["account_number", "employee__last_name", "created_at"]
    ordering = ["-created_at"]

    def get_queryset(self):
        qs = AccessPass.objects.select_related(
            "employee", "employee__avatar", "storage_place__room__building"
        ).prefetch_related("buildings", "rooms", "places__room")
        user = self.request.user
        if user.role == "employee" and not user.is_observer:
            # Обычный «Сотрудник» — только свои пропуска (в Профиле); не привязан
            # к Сотруднику — не видит ничего. Наблюдатель видит весь раздел (ниже).
            return qs.filter(employee_id=user.employee_id) if user.employee_id else qs.none()
        employee = self.request.query_params.get("employee")
        if employee:
            qs = qs.filter(employee_id=employee)

        if self.action == "list":
            # Активные (все неутилизированные) / Утилизировано. Внутри «Активных»
            # фильтр status: attached (Выданные — за сотрудником) / free
            # (Неиспользуемые — без сотрудника). tab=deactivated сохранён для
            # подбора свободных пропусков при привязке (AttachOrCreateModal).
            tab = self.request.query_params.get("tab")
            if tab == "active":
                qs = qs.filter(is_utilized=False)
                status = self.request.query_params.get("status")
                if status == "attached":
                    qs = qs.filter(employee__isnull=False)
                elif status == "free":
                    qs = qs.filter(employee__isnull=True)
            elif tab == "deactivated":
                qs = qs.filter(employee__isnull=True, is_utilized=False)
            elif tab == "utilized":
                qs = qs.filter(is_utilized=True)
            search = self.request.query_params.get("search")
            if search:
                # Поиск по Типу (Пропуск/Ключ, а также Авто/Пеший), Учётному
                # номеру, Названию места хранения и закреплённому Сотруднику
                # (Фамилия/Имя/Должность/Отдел). Тип хранится кодом (pass/key),
                # поэтому русские слова сопоставляем вручную.
                cond = (
                    Q(account_number__icontains=search)
                    | Q(storage_place__name__icontains=search)
                    | Q(employee__last_name__icontains=search)
                    | Q(employee__first_name__icontains=search)
                    | Q(employee__position__icontains=search)
                    | Q(employee__department__icontains=search)
                )
                # Тип хранится кодом (pass/key) плюс флаги Авто/Пеший — русские
                # слова сопоставляем по префиксу в обе стороны, чтобы срабатывал и
                # неполный ввод («проп» → Пропуск), а не только слово целиком.
                term = _norm(search)
                type_keywords = [
                    ("пропуск", Q(object_type=AccessPass.ObjectType.PASS)),
                    ("ключ", Q(object_type=AccessPass.ObjectType.KEY)),
                    ("авто", Q(type_vehicle=True)),
                    ("пеший", Q(type_pedestrian=True)),
                ]
                for kw, q in type_keywords:
                    if term and (kw.startswith(term) or term.startswith(kw)):
                        cond |= q
                qs = qs.filter(cond).distinct()
        return qs

    @action(detail=True, methods=["post"], permission_classes=[IsAdminOrAccountant])
    def detach(self, request, pk=None):
        """Открепить от сотрудника — пропуск/ключ уходит на склад (место
        хранения обязательно). Остаётся для истории и повторной выдачи."""
        from core.placement import get_storage_place

        access_pass = self.get_object()
        storage = get_storage_place(request.data.get("storage_place"))
        access_pass.employee = None
        access_pass.storage_place = storage
        comment = (request.data.get("comment") or "").strip()
        if comment:
            access_pass._change_reason = comment
        access_pass.save(update_fields=["employee", "storage_place"])
        return Response(AccessPassSerializer(access_pass).data)

    @action(detail=True, methods=["post"], permission_classes=[IsAdminOrAccountant])
    def attach(self, request, pk=None):
        """Привязать к сотруднику (активировать). Снимает со склада."""
        access_pass = self.get_object()
        employee = get_object_or_404(Employee, pk=request.data.get("employee"))
        access_pass.employee = employee
        access_pass.storage_place = None
        comment = (request.data.get("comment") or "").strip()
        if comment:
            access_pass._change_reason = comment
        access_pass.save(update_fields=["employee", "storage_place"])
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
            access_pass.storage_place = None
            access_pass.is_utilized = True
            access_pass.utilized_at = timezone.now()
            access_pass.utilization_reason = reason
            comment = (request.data.get("comment") or "").strip()
            if comment:
                access_pass._change_reason = comment
            access_pass.save(update_fields=["employee", "storage_place", "is_utilized", "utilized_at", "utilization_reason"])
        return Response(AccessPassSerializer(access_pass).data)

    @action(detail=True, methods=["get"], url_path="history")
    def history_list(self, request, pk=None):
        from datetime import timedelta

        from locations.models import Building, Place, Room

        from core.history import CREATION_WINDOW, build_history_rows

        access_pass = self.get_object()

        # Форматирование набора доступа (M2M) по списку id — с сохранением
        # порядка id. Место показываем с помещением-родителем.
        def _ordered(qs, ids):
            by_id = {o.id: o for o in qs.filter(id__in=ids)}
            return [by_id[i] for i in ids if i in by_id]

        def fmt_buildings(ids):
            return ", ".join(b.name for b in _ordered(Building.objects, ids))

        def fmt_rooms(ids):
            return ", ".join(r.name for r in _ordered(Room.objects, ids))

        def fmt_places(ids):
            return ", ".join(f"{p.name} ({p.room.name})" for p in _ordered(Place.objects.select_related("room"), ids))

        # Набор зданий/помещений/мест — M2M, задаётся сразу после создания объекта
        # (отдельными историческими записями в ту же секунду). Реконструируем
        # состояние на конец «окна создания» и показываем его в записи «Объект
        # создан» — как учётный номер и прочие поля.
        def _created_access_lines():
            creation = access_pass.history.filter(history_type="+").order_by("history_date").first()
            if creation is None:
                return []
            window_end = creation.history_date + CREATION_WINDOW
            snap = (
                access_pass.history.filter(history_date__lte=window_end)
                .order_by("-history_date", "-history_id")
                .first()
            )
            if snap is None:
                return []
            lines = []
            for label, fmt, ids in (
                ("Здания", fmt_buildings, [x.building_id for x in snap.buildings.all()]),
                ("Помещения", fmt_rooms, [x.room_id for x in snap.rooms.all()]),
                ("Места", fmt_places, [x.place_id for x in snap.places.all()]),
            ):
                value = fmt(ids)
                if value:
                    lines.append({"label": label, "value": value})
            return lines

        m2m_specs = {
            "buildings": {"id_attr": "building_id", "label": "Здания", "format": fmt_buildings},
            "rooms": {"id_attr": "room_id", "label": "Помещения", "format": fmt_rooms},
            "places": {"id_attr": "place_id", "label": "Места", "format": fmt_places},
        }

        def fmt_employee(v):
            if not v:
                return "Не закреплён"
            emp = Employee.objects.filter(pk=v).first()
            return str(emp) if emp else "—"

        yes_no = lambda v: "Да" if v else "Нет"
        fmt_object_type = lambda v: dict(AccessPass.ObjectType.choices).get(v, v or "—")

        def _fmt_storage_place(v):
            if not v:
                return "—"
            p = Place.objects.select_related("room__building").filter(pk=v).first()
            return f"«{p.name}» ({p.room.building.name} — {p.room.name})" if p else "—"

        def utilize_label(record):
            reason = record.utilization_reason
            return dict(AccessPass.UtilizationReason.choices).get(reason, "Утилизирован")

        field_specs = {
            "object_type": {"label": "Тип объекта", "format": fmt_object_type},
            "account_number": {"label": "Учётный номер"},
            "type_vehicle": {"label": "Тип «Авто»", "format": yes_no},
            "type_pedestrian": {"label": "Тип «Пеший»", "format": yes_no},
            "employee": {"label": "Закреплён за", "format": fmt_employee, "in_created": False},
            "storage_place": {
                "label": "Место хранения",
                "format": lambda v: _fmt_storage_place(v),
                "in_created": False,
            },
        }
        rows = build_history_rows(
            access_pass, field_specs,
            movement_fields={"employee", "storage_place"},
            movement_events=[{
                "trigger": "is_utilized", "to": True,
                "consume": ["is_utilized", "utilized_at", "utilization_reason", "employee", "storage_place"],
                "label": utilize_label,
            }],
            created_extra_lines=_created_access_lines(),
            m2m_specs=m2m_specs,
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


class MyWorkPlacementView(APIView):
    """Профиль сотрудника (роль «Сотрудник»): свои Инструменты и Рабочие места
    с объектами. Карточка /employees/{id}/ этой роли недоступна, поэтому нужные
    блоки отдаём отдельным лёгким эндпоинтом для залогиненного пользователя."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        emp_id = getattr(request.user, "employee_id", None)
        if not emp_id:
            return Response({"tools": [], "workplaces": []})
        emp = (
            Employee.objects.prefetch_related(
                "tool_allocations__tool",
                "workplaces__room__building",
                "workplaces__equipment__equipment_type",
                "workplaces__equipment__field_values__field",
                "workplaces__tool_allocations__tool",
            )
            .get(pk=emp_id)
        )
        data = EmployeeSerializer(emp, context={"request": request}).data
        return Response({"tools": data["tools"], "workplaces": data["workplaces"]})


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
