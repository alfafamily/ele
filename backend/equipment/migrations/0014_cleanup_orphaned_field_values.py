"""v1.10.1: подчистить «осиротевшие» значения реквизитов оборудования.

Тот же класс дефекта, что и у лицензий: при смене Типа оборудования значения
реквизитов прежнего Типа могли оставаться. Удаляем значения, чей реквизит
принадлежит не текущему Типу оборудования. Идемпотентно (на чистых данных — no-op).
"""
from django.db import migrations
from django.db.models import F


def cleanup_orphaned(apps, schema_editor):
    EquipmentFieldValue = apps.get_model("equipment", "EquipmentFieldValue")
    EquipmentFieldValue.objects.exclude(field__equipment_type=F("equipment__equipment_type")).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("equipment", "0013_equipmenttype_allows_sim"),
    ]

    operations = [
        migrations.RunPython(cleanup_orphaned, migrations.RunPython.noop),
    ]
