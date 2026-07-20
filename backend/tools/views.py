from django.db.models import Q, Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import filters, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from core.mixins import CreationCommentMixin
from core.pagination import ELECursorPagination
from core.permissions import IsAdminOrAccountant, ToolAccessPermission
from employees.models import Employee

from .models import Tool, ToolAllocation, ToolMovement
from .serializers import ToolSerializer


class ToolViewSet(CreationCommentMixin, viewsets.ModelViewSet):
    """Инструменты — количественный учёт. Удаления нет, только списание всей
    карточки (write_off) — как у Оборудования."""

    serializer_class = ToolSerializer
    permission_classes = [ToolAccessPermission]
    pagination_class = ELECursorPagination
    filter_backends = [filters.OrderingFilter]
    ordering_fields = ["created_at", "name"]
    ordering = ["-created_at"]

    def destroy(self, request, *args, **kwargs):
        return Response({"detail": "Инструмент не удаляется — только списание."}, status=405)

    def get_queryset(self):
        qs = Tool.objects.prefetch_related(
            "allocations__employee__avatar", "allocations__place__room__building", "custom_fields"
        )
        user = self.request.user
        if user.role == "employee" and not user.is_observer:
            # Видит только инструменты, где за ним есть закрепление.
            qs = qs.filter(allocations__employee_id=user.employee_id).distinct() if user.employee_id else qs.none()

        if self.action != "list":
            return qs

        tab = self.request.query_params.get("tab", "active")
        qs = qs.filter(is_written_off=(tab == "archive"))

        employee = self.request.query_params.get("employee")
        if employee:
            qs = qs.filter(allocations__employee_id=employee).distinct()

        search = self.request.query_params.get("search")
        if search:
            qs = qs.filter(Q(name__icontains=search)).distinct()
        return qs

    # ——— движения по остатку (B8: остаток лежит на складах) ————————————————

    def _record_movement(self, tool, kind, quantity, user, comment,
                         employee=None, place=None, storage_place=None):
        return ToolMovement.objects.create(
            tool=tool, kind=kind, quantity=quantity, employee=employee,
            place=place, storage_place=storage_place, comment=comment or "",
            created_by=user if getattr(user, "is_authenticated", False) else None,
        )

    def _guard(self, tool):
        if tool.is_written_off:
            return Response({"detail": "Инструмент списан — операции недоступны."}, status=409)
        return None

    def _parse_positive_qty(self, request):
        try:
            qty = int(request.data.get("quantity"))
        except (TypeError, ValueError):
            return None, Response({"detail": "Укажите количество."}, status=400)
        if qty <= 0:
            return None, Response({"detail": "Количество должно быть больше нуля."}, status=400)
        return qty, None

    def _assigned_units(self, tool):
        # Закреплено = сумма размещений за сотрудниками и рабочими местами.
        s = tool.allocations.filter(
            Q(employee__isnull=False) | Q(place__place_type="workplace")
        ).aggregate(s=Sum("quantity"))["s"]
        return s or 0

    def _free_units(self, tool):
        # Свободно = всё, что лежит на складах (== quantity − закреплено).
        return tool.quantity - self._assigned_units(tool)

    def _free_at(self, tool, place):
        alloc = tool.allocations.filter(place=place).first()
        return alloc.quantity if alloc else 0

    def _inc_alloc(self, tool, qty, *, employee=None, place=None):
        alloc, _ = ToolAllocation.objects.get_or_create(
            tool=tool, employee=employee, place=place, defaults={"quantity": 0}
        )
        alloc.quantity += qty
        alloc.save(update_fields=["quantity"])

    def _dec_alloc(self, alloc, qty):
        alloc.quantity -= qty
        if alloc.quantity == 0:
            alloc.delete()
        else:
            alloc.save(update_fields=["quantity"])

    @action(detail=True, methods=["post"], url_path="add-units", permission_classes=[IsAdminOrAccountant])
    def add_units(self, request, pk=None):
        """Приход: qty единиц ложится на выбранный склад (место хранения)."""
        from core.placement import get_storage_place

        tool = self.get_object()
        if (err := self._guard(tool)) is not None:
            return err
        qty, err = self._parse_positive_qty(request)
        if err is not None:
            return err
        storage = get_storage_place(request.data.get("place"), field="place")
        comment = (request.data.get("comment") or "").strip()
        tool.quantity += qty
        tool.save(update_fields=["quantity"])
        self._inc_alloc(tool, qty, place=storage)
        self._record_movement(tool, ToolMovement.Kind.ADD, qty, request.user, comment, place=storage)
        return Response(ToolSerializer(self.get_object()).data)

    @action(detail=True, methods=["post"], url_path="write-off-units", permission_classes=[IsAdminOrAccountant])
    def write_off_units(self, request, pk=None):
        """Списание qty со склада (свободного остатка)."""
        from core.placement import get_storage_place

        tool = self.get_object()
        if (err := self._guard(tool)) is not None:
            return err
        qty, err = self._parse_positive_qty(request)
        if err is not None:
            return err
        storage = get_storage_place(request.data.get("place"), field="place")
        if qty > self._free_at(tool, storage):
            return Response({"detail": "Нельзя списать больше, чем лежит на этом складе."}, status=409)
        comment = (request.data.get("comment") or "").strip()
        self._dec_alloc(tool.allocations.get(place=storage), qty)
        tool.quantity -= qty
        tool.save(update_fields=["quantity"])
        self._record_movement(tool, ToolMovement.Kind.WRITE_OFF, qty, request.user, comment, place=storage)
        return Response(ToolSerializer(self.get_object()).data)

    @action(detail=True, methods=["post"], url_path="assign-units", permission_classes=[IsAdminOrAccountant])
    def assign_units(self, request, pk=None):
        """Раздача qty со склада: mode=mobile — сотруднику; mode=stationary — на
        рабочее место. Источник — склад (from place)."""
        from core.placement import get_storage_place, get_workplace

        tool = self.get_object()
        if (err := self._guard(tool)) is not None:
            return err
        qty, err = self._parse_positive_qty(request)
        if err is not None:
            return err
        storage = get_storage_place(request.data.get("from_place"), field="from_place")
        if qty > self._free_at(tool, storage):
            return Response({"detail": "Нельзя выдать больше, чем лежит на этом складе."}, status=409)
        mode = request.data.get("mode", "mobile")
        employee = target_place = None
        if mode == "stationary":
            target_place = get_workplace(request.data.get("place"))
        else:
            employee = get_object_or_404(Employee, pk=request.data.get("employee"))
        comment = (request.data.get("comment") or "").strip()
        self._dec_alloc(tool.allocations.get(place=storage), qty)
        self._inc_alloc(tool, qty, employee=employee, place=target_place)
        self._record_movement(
            tool, ToolMovement.Kind.ASSIGN, qty, request.user, comment,
            employee=employee, place=target_place, storage_place=storage,
        )
        return Response(ToolSerializer(self.get_object()).data)

    @action(detail=True, methods=["post"], url_path="unassign-units", permission_classes=[IsAdminOrAccountant])
    def unassign_units(self, request, pk=None):
        """Возврат qty от сотрудника/рабочего места обратно на склад (to place)."""
        from core.placement import get_storage_place, get_workplace

        tool = self.get_object()
        if (err := self._guard(tool)) is not None:
            return err
        qty, err = self._parse_positive_qty(request)
        if err is not None:
            return err
        storage = get_storage_place(request.data.get("to_place"), field="to_place")
        mode = request.data.get("mode", "mobile")
        employee = source_place = None
        if mode == "stationary":
            source_place = get_workplace(request.data.get("place"))
            alloc = tool.allocations.filter(place=source_place).first()
            miss = "Нельзя вернуть больше, чем закреплено за рабочим местом."
        else:
            employee = get_object_or_404(Employee, pk=request.data.get("employee"))
            alloc = tool.allocations.filter(employee=employee).first()
            miss = "Нельзя вернуть больше, чем закреплено за сотрудником."
        if not alloc or qty > alloc.quantity:
            return Response({"detail": miss}, status=409)
        comment = (request.data.get("comment") or "").strip()
        self._dec_alloc(alloc, qty)
        self._inc_alloc(tool, qty, place=storage)
        self._record_movement(
            tool, ToolMovement.Kind.UNASSIGN, qty, request.user, comment,
            employee=employee, place=source_place, storage_place=storage,
        )
        return Response(ToolSerializer(self.get_object()).data)

    @action(detail=True, methods=["post"], url_path="write-off", permission_classes=[IsAdminOrAccountant])
    def write_off(self, request, pk=None):
        """Списание всей карточки в архив: снимаем все размещения и обнуляем
        остаток (весь остаток уходит из обращения). Списанное количество
        показывается строкой «Списано: N шт.» в истории (см. history_list)."""
        tool = self.get_object()
        if tool.is_written_off:
            return Response({"detail": "Инструмент уже списан."}, status=409)
        comment = (request.data.get("comment") or "").strip()
        # Фиксируем открепление закреплённых (за сотрудниками/рабочими местами)
        # частей; свободный складской остаток просто уходит вместе с карточкой.
        for alloc in list(tool.allocations.filter(Q(employee__isnull=False) | Q(place__place_type="workplace"))):
            self._record_movement(
                tool, ToolMovement.Kind.UNASSIGN, alloc.quantity, request.user, comment,
                employee=alloc.employee, place=alloc.place,
            )
        tool.allocations.all().delete()
        tool.quantity = 0
        tool.is_written_off = True
        tool.written_off_at = timezone.now()
        if comment:
            tool._change_reason = comment
        tool.save(update_fields=["quantity", "is_written_off", "written_off_at"])
        return Response(ToolSerializer(self.get_object()).data)

    @action(detail=True, methods=["get"], url_path="history")
    def history_list(self, request, pk=None):
        from core.history import build_history_rows, build_related_history_rows

        from .models import ToolCustomField

        tool = self.get_object()

        # Списанное количество (остаток на момент архивации) — для «Списано: N шт.».
        written_off_qty = None
        if tool.is_written_off:
            recs = list(tool.history.order_by("history_date", "history_id"))
            for i, r in enumerate(recs):
                prev_wo = recs[i - 1].is_written_off if i > 0 else False
                if r.is_written_off and not prev_wo:
                    written_off_qty = recs[i - 1].quantity if i > 0 else r.quantity
                    break

        related_rows = []
        created_extra = []

        # Доп. поля
        cf_rows, cf_created = build_related_history_rows(
            ToolCustomField.history.filter(tool_id=tool.id),
            label_fn=lambda rec: rec.name,
            value_fn=lambda rec: rec.value,
            created_at=tool.created_at,
        )
        related_rows += cf_rows
        created_extra += cf_created

        # Движения по количеству
        def target(m):
            # Контрагент движения: сотрудник (мобильно) или рабочее место (стац.).
            if m.employee_id:
                return f"«{m.employee}»"
            if m.place_id:
                return f"рабочее место «{m.place.name}»"
            return "—"

        def mv_label(m):
            if m.kind == ToolMovement.Kind.ADD:
                where = f" на «{m.place.name}»" if m.place_id else ""
                return f"Приход: +{m.quantity} шт.{where}"
            if m.kind == ToolMovement.Kind.WRITE_OFF:
                where = f" со склада «{m.place.name}»" if m.place_id else ""
                return f"Списание: −{m.quantity} шт.{where}"
            store = f" (склад «{m.storage_place.name}»)" if m.storage_place_id else ""
            if m.kind == ToolMovement.Kind.ASSIGN:
                return f"Закреплено: {m.quantity} шт. за {target(m)}{store}"
            return f"Откреплено: {m.quantity} шт. от {target(m)}{store}"

        for m in tool.movements.select_related("created_by", "employee", "place", "storage_place"):
            related_rows.append({
                "date": m.created_at,
                "author": m.created_by.email if m.created_by_id else None,
                "kind": "movement", "category": "movement",
                "label": mv_label(m), "old": None, "new": None,
                "secret": False, "comment": m.comment or None,
            })

        initial = tool.history.filter(history_type="+").values_list("quantity", flat=True).first()
        if initial is not None:
            created_extra.append({"label": "Начальный остаток", "value": f"{initial} шт."})

        def archived_label(_record):
            return f"Списано: {written_off_qty} шт." if written_off_qty is not None else "Списано"

        rows = build_history_rows(
            tool,
            {"name": {"label": "Наименование"}},
            movement_events=[{
                "trigger": "is_written_off", "to": True,
                "consume": ["is_written_off", "written_off_at", "quantity"],
                "label": archived_label,
            }],
            created_extra_lines=created_extra,
        )
        rows += related_rows
        rows.sort(key=lambda r: r["date"], reverse=True)
        return Response(rows)
