"""B13: техническое обслуживание (ТО) оборудования.

- EquipmentType.maintenance_enabled — флаг «доступно проведение ТО» (opt-in).
- Equipment.next_maintenance_date — денормализованная плановая дата следующего
  ТО (из последней записи MaintenanceRecord).
- MaintenanceRecord / MaintenanceRecordItem — журнал проведённых ТО с позициями.
"""

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("equipment", "0014_cleanup_orphaned_field_values"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="equipmenttype",
            name="maintenance_enabled",
            field=models.BooleanField(default=False, verbose_name="Проведение ТО"),
        ),
        migrations.AddField(
            model_name="equipment",
            name="next_maintenance_date",
            field=models.DateField(blank=True, null=True, verbose_name="Плановая дата ТО"),
        ),
        migrations.AddField(
            model_name="historicalequipment",
            name="next_maintenance_date",
            field=models.DateField(blank=True, null=True, verbose_name="Плановая дата ТО"),
        ),
        migrations.CreateModel(
            name="MaintenanceRecord",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("performed_at", models.DateTimeField(auto_now_add=True, verbose_name="Проведено")),
                ("next_planned_date", models.DateField(blank=True, null=True, verbose_name="Дата следующего ТО")),
                ("prior_planned_date", models.DateField(blank=True, null=True, verbose_name="Плановая дата на момент ТО")),
                ("comment", models.TextField(blank=True, verbose_name="Комментарий")),
                (
                    "created_by",
                    models.ForeignKey(
                        blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                        related_name="+", to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "equipment",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="maintenance_records", to="equipment.equipment",
                    ),
                ),
            ],
            options={
                "verbose_name": "Запись о ТО",
                "verbose_name_plural": "Записи о ТО",
                "ordering": ["performed_at", "id"],
            },
        ),
        migrations.CreateModel(
            name="MaintenanceRecordItem",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("kind", models.CharField(choices=[("work", "Работы"), ("material", "Материалы")], max_length=10, verbose_name="Тип")),
                ("name", models.CharField(max_length=255, verbose_name="Наименование")),
                ("quantity", models.DecimalField(decimal_places=3, max_digits=12, verbose_name="Количество")),
                (
                    "record",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="items", to="equipment.maintenancerecord",
                    ),
                ),
            ],
            options={
                "verbose_name": "Позиция ТО",
                "verbose_name_plural": "Позиции ТО",
                "ordering": ["id"],
            },
        ),
    ]
