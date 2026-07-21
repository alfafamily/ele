"""Флаг «Установка лицензий» у типа оборудования.

Новое поле выключено по умолчанию (opt-in). Чтобы не сломать уже работающие
установки, типам, у которых есть оборудование с привязанной лицензией,
проставляем allows_license=True — иначе такую лицензию нельзя было бы привязать
повторно, а блок «Установленные лицензии» скрылся бы у оборудования с лицензиями.
"""
from django.db import migrations, models


def enable_for_existing_license_equipment(apps, schema_editor):
    EquipmentType = apps.get_model("equipment", "EquipmentType")
    License = apps.get_model("licenses", "License")
    type_ids = set(
        License.objects.filter(equipment__isnull=False).values_list(
            "equipment__equipment_type_id", flat=True
        )
    )
    type_ids.discard(None)
    if type_ids:
        EquipmentType.objects.filter(id__in=type_ids).update(allows_license=True)


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("equipment", "0016_remove_equipment_next_maintenance_date_and_more"),
        ("licenses", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="equipmenttype",
            name="allows_license",
            field=models.BooleanField(default=False, verbose_name="Установка лицензий"),
        ),
        migrations.RunPython(enable_for_existing_license_equipment, noop),
    ]
