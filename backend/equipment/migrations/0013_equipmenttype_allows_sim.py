"""B17: флаг «Установка SIM/E-SIM» у типа оборудования.

Новое поле выключено по умолчанию (opt-in). Чтобы не сломать уже работающие
установки, типам, у которых есть оборудование с установленной SIM, проставляем
allows_sim=True — иначе такую SIM нельзя было бы установить повторно.
"""
from django.db import migrations, models


def enable_for_existing_sim_equipment(apps, schema_editor):
    EquipmentType = apps.get_model("equipment", "EquipmentType")
    SimCard = apps.get_model("employees", "SimCard")
    type_ids = set(
        SimCard.objects.filter(equipment__isnull=False).values_list(
            "equipment__equipment_type_id", flat=True
        )
    )
    type_ids.discard(None)
    if type_ids:
        EquipmentType.objects.filter(id__in=type_ids).update(allows_sim=True)


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("equipment", "0012_equipment_place_historicalequipment_place"),
        ("employees", "0011_accesspass_storage_place_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="equipmenttype",
            name="allows_sim",
            field=models.BooleanField(default=False, verbose_name="Установка SIM/E-SIM"),
        ),
        migrations.RunPython(enable_for_existing_sim_equipment, noop),
    ]
