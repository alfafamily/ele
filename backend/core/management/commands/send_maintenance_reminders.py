"""B44. Рассылка напоминаний о ТО: «подходит» (due_soon) и «просрочено».

Запускается периодически из сервиса cron (тот же цикл, что автокопии). Дедуп по
плану через MaintenanceReminderState: напоминание шлётся один раз при входе в
статус, а не каждый прогон. Когда план выходит из статусов оповещения (ТО
проведено, дата ушла в будущее) — отметка сбрасывается, и следующий вход снова
оповестит.
"""
from django.core.management.base import BaseCommand
from django.utils import timezone

from accounts.models import MaintenanceReminderState, NotificationKind
from accounts.notifications import notify_maintenance
from equipment.maintenance import DUE_SOON, OVERDUE, plan_status

_STATUS_KIND = {
    DUE_SOON: NotificationKind.MAINTENANCE_DUE,
    OVERDUE: NotificationKind.MAINTENANCE_OVERDUE,
}


class Command(BaseCommand):
    help = "Разослать напоминания о ТО (подходит/просрочено) с дедупом по плану."

    def handle(self, *args, **options):
        today = timezone.localdate()
        total = self._run("equipment", today) + self._run("transport", today)
        self.stdout.write(f"Отправлено напоминаний: {total}")

    def _run(self, domain, today) -> int:
        if domain == "equipment":
            from equipment.models import EquipmentMaintenancePlan as Plan
            obj_attr = "equipment"
            plans = (
                Plan.objects.filter(
                    is_cancelled=False, regulation__is_archived=False,
                    regulation__on_demand=False,
                    equipment__is_written_off=False,
                    equipment__equipment_type__maintenance_enabled=True,
                )
                .select_related("regulation", "equipment", "equipment__equipment_type")
                .prefetch_related("equipment__field_values__field")
            )
        else:
            from transport.models import TransportMaintenancePlan as Plan
            obj_attr = "transport"
            plans = (
                Plan.objects.filter(
                    is_cancelled=False, regulation__is_archived=False,
                    regulation__on_demand=False,
                    transport__is_written_off=False,
                )
                .select_related("regulation", "transport", "transport__transport_type")
                .prefetch_related("transport__field_values__field")
            )

        sent = 0
        for plan in plans:
            status = plan_status(plan.next_planned_date, today)
            state, _ = MaintenanceReminderState.objects.get_or_create(
                plan_kind=domain, plan_id=plan.id,
            )
            if status in _STATUS_KIND:
                if state.notified_status != status:
                    notify_maintenance(
                        getattr(plan, obj_attr), _STATUS_KIND[status],
                        date=plan.next_planned_date,
                    )
                    state.notified_status = status
                    state.save(update_fields=["notified_status", "updated_at"])
                    sent += 1
            elif state.notified_status:
                # Вышли из «подходит/просрочено» — сброс, чтобы вход снова уведомил.
                state.notified_status = ""
                state.save(update_fields=["notified_status", "updated_at"])
        return sent
