# Пропуск теперь может действовать в нескольких зданиях: одиночный FK building
# заменяется на M2M buildings. Порядок операций важен — сначала добавляем
# buildings и переносим данные, только потом удаляем building.
import django.db.models.deletion
import simple_history.models
from django.db import migrations, models


def copy_building_to_buildings(apps, schema_editor):
    AccessPass = apps.get_model("employees", "AccessPass")
    for ap in AccessPass.objects.all():
        if ap.building_id:
            ap.buildings.add(ap.building_id)


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("employees", "0004_accesspass_historicalaccesspass_and_more"),
        ("locations", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="accesspass",
            name="buildings",
            field=models.ManyToManyField(related_name="+", to="locations.building", verbose_name="Здания"),
        ),
        migrations.CreateModel(
            name="HistoricalAccessPass_buildings",
            fields=[
                ("id", models.BigIntegerField(auto_created=True, blank=True, db_index=True, verbose_name="ID")),
                ("m2m_history_id", models.AutoField(primary_key=True, serialize=False)),
                ("accesspass", models.ForeignKey(blank=True, db_constraint=False, db_tablespace="", null=True, on_delete=django.db.models.deletion.DO_NOTHING, related_name="+", to="employees.accesspass")),
                ("building", models.ForeignKey(blank=True, db_constraint=False, db_tablespace="", null=True, on_delete=django.db.models.deletion.DO_NOTHING, related_name="+", to="locations.building")),
                ("history", models.ForeignKey(db_constraint=False, on_delete=django.db.models.deletion.DO_NOTHING, to="employees.historicalaccesspass")),
            ],
            options={
                "verbose_name": "HistoricalAccessPass_buildings",
            },
            bases=(simple_history.models.HistoricalChanges, models.Model),
        ),
        migrations.RunPython(copy_building_to_buildings, noop),
        migrations.RemoveField(
            model_name="accesspass",
            name="building",
        ),
        migrations.RemoveField(
            model_name="historicalaccesspass",
            name="building",
        ),
    ]
