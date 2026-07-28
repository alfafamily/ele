"""B32. Бэкфилл эпизодов закрепления для уже закреплённых объектов.

Все текущие закрепления за сотрудником (Оборудование/SIM/Пропуск/Инструмент)
получают открытый EmployeeAssignment. Статус — «заочно»; если у сотрудника уже
есть связанный пользователь — «ожидает подтверждения» (was_in_absentia=True), он
увидит блок акцепта в Профиле. Писем не шлём. Дата закрепления — момент последнего
перехода объекта к этому сотруднику по истории (fallback — дата создания объекта).
"""

from django.db import migrations
from django.utils import timezone


def _assigned_at(hist_qs, obj_id, emp_id, created_at):
    """Начало текущего непрерывного владения сотрудником emp_id по истории."""
    recs = list(hist_qs.filter(id=obj_id).order_by("history_date", "history_id"))
    start = None
    prev_here = False
    for r in recs:
        here = (r.employee_id == emp_id) and (r.history_type != "-")
        if here and not prev_here:
            start = r.history_date
        prev_here = here
    return start or created_at or timezone.now()


def forward(apps, schema_editor):
    ContentType = apps.get_model("contenttypes", "ContentType")
    EmployeeAssignment = apps.get_model("employees", "EmployeeAssignment")
    Employee = apps.get_model("employees", "Employee")
    Equipment = apps.get_model("equipment", "Equipment")
    HistoricalEquipment = apps.get_model("equipment", "HistoricalEquipment")
    SimCard = apps.get_model("employees", "SimCard")
    HistoricalSimCard = apps.get_model("employees", "HistoricalSimCard")
    AccessPass = apps.get_model("employees", "AccessPass")
    HistoricalAccessPass = apps.get_model("employees", "HistoricalAccessPass")
    Transport = apps.get_model("transport", "Transport")
    HistoricalTransport = apps.get_model("transport", "HistoricalTransport")
    ToolAllocation = apps.get_model("tools", "ToolAllocation")

    # Сотрудники, у которых есть связанный пользователь (OneToOne User.employee).
    User = apps.get_model("accounts", "User")
    users_by_emp = set(User.objects.filter(employee_id__isnull=False).values_list("employee_id", flat=True))

    def ct(app_label, model_name):
        obj, _ = ContentType.objects.get_or_create(app_label=app_label, model=model_name)
        return obj

    ct_equipment = ct("equipment", "equipment")
    ct_sim = ct("employees", "simcard")
    ct_pass = ct("employees", "accesspass")
    ct_tool = ct("tools", "tool")
    ct_transport = ct("transport", "transport")

    def make(content_type, hist_model, kind, employee_id, obj_id, created_at, return_place_id=None, return_quantity=None):
        has_user = employee_id in users_by_emp
        EmployeeAssignment.objects.create(
            content_type=content_type, object_id=obj_id, object_kind=kind,
            employee_id=employee_id,
            status="pending" if has_user else "in_absentia",
            was_in_absentia=has_user,
            assigned_at=_assigned_at(hist_model.objects, obj_id, employee_id, created_at),
            return_place_id=return_place_id, return_quantity=return_quantity,
        )

    for eq in Equipment.objects.filter(employee_id__isnull=False):
        make(ct_equipment, HistoricalEquipment, "equipment", eq.employee_id, eq.id, eq.created_at)
    for sim in SimCard.objects.filter(employee_id__isnull=False):
        make(ct_sim, HistoricalSimCard, "sim", sim.employee_id, sim.id, sim.created_at)
    for ap in AccessPass.objects.filter(employee_id__isnull=False):
        make(ct_pass, HistoricalAccessPass, "pass", ap.employee_id, ap.id, ap.created_at)
    for tr in Transport.objects.filter(employee_id__isnull=False):
        make(ct_transport, HistoricalTransport, "transport", tr.employee_id, tr.id, tr.created_at)
    # Инструменты: один открытый эпизод на размещение (tool, employee) с текущим кол-вом.
    for alloc in ToolAllocation.objects.filter(employee_id__isnull=False):
        has_user = alloc.employee_id in users_by_emp
        EmployeeAssignment.objects.create(
            content_type=ct_tool, object_id=alloc.tool_id, object_kind="tool",
            employee_id=alloc.employee_id,
            status="pending" if has_user else "in_absentia",
            was_in_absentia=has_user,
            assigned_at=timezone.now(),
            return_quantity=alloc.quantity,
        )


def backward(apps, schema_editor):
    EmployeeAssignment = apps.get_model("employees", "EmployeeAssignment")
    EmployeeAssignment.objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ("employees", "0014_employeeassignment"),
        ("equipment", "0018_alter_equipmentcustomfield_options_and_more"),
        ("tools", "0005_alter_toolcustomfield_options_and_more"),
        ("transport", "0002_historicaltransport_parks_at_driver_address_and_more"),
        ("accounts", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(forward, backward),
    ]
