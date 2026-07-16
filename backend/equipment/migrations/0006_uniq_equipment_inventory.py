"""Уникальность учётного номера Оборудования. Существующие дубли не удаляем
(Оборудование не удаляется по дизайну) — переименовываем лишние, добавляя
суффикс «-<pk>», затем вешаем UniqueConstraint."""
from collections import defaultdict

from django.db import migrations, models


def dedupe_inventory_numbers(apps, schema_editor):
    Equipment = apps.get_model("equipment", "Equipment")
    groups = defaultdict(list)
    for eq in Equipment.objects.all().order_by("id"):
        groups[eq.inventory_number].append(eq)
    for number, items in groups.items():
        if len(items) < 2:
            continue
        # Первый (самый старый) сохраняет номер, остальным добавляем суффикс.
        for eq in items[1:]:
            eq.inventory_number = f"{number}-{eq.pk}"
            eq.save(update_fields=["inventory_number"])


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("equipment", "0005_equipmenttypefield_allow_multiple_and_more"),
    ]

    operations = [
        migrations.RunPython(dedupe_inventory_numbers, noop),
        migrations.AddConstraint(
            model_name="equipment",
            constraint=models.UniqueConstraint(fields=["inventory_number"], name="uniq_equipment_inventory"),
        ),
    ]
