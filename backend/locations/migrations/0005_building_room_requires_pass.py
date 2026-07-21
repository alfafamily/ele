from django.db import migrations, models


def flag_referenced(apps, schema_editor):
    """Обратная совместимость (B15): здания и помещения, на которые уже есть
    привязки ключей/пропусков (M2M AccessPass.buildings / .rooms), помечаем
    «Требуется ключ/пропуск». Иначе после включения серверной фильтрации по флагу
    такие пропуски нельзя было бы отредактировать (их объект доступа выпал бы из
    списка допустимых). Аналогично B17 (миграция включила флаг у типов с уже
    установленными SIM)."""
    AccessPass = apps.get_model("employees", "AccessPass")
    Building = apps.get_model("locations", "Building")
    Room = apps.get_model("locations", "Room")
    building_ids = set(AccessPass.buildings.through.objects.values_list("building_id", flat=True))
    if building_ids:
        Building.objects.filter(id__in=building_ids).update(requires_pass=True)
    room_ids = set(AccessPass.rooms.through.objects.values_list("room_id", flat=True))
    if room_ids:
        Room.objects.filter(id__in=room_ids).update(requires_pass=True)


class Migration(migrations.Migration):

    dependencies = [
        ("employees", "0011_accesspass_storage_place_and_more"),
        ("locations", "0004_historicalplace_place_type_place_employees_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="building",
            name="requires_pass",
            field=models.BooleanField(default=False, verbose_name="Требуется ключ/пропуск"),
        ),
        migrations.AddField(
            model_name="historicalbuilding",
            name="requires_pass",
            field=models.BooleanField(default=False, verbose_name="Требуется ключ/пропуск"),
        ),
        migrations.AddField(
            model_name="room",
            name="requires_pass",
            field=models.BooleanField(default=False, verbose_name="Требуется ключ/пропуск"),
        ),
        migrations.AddField(
            model_name="historicalroom",
            name="requires_pass",
            field=models.BooleanField(default=False, verbose_name="Требуется ключ/пропуск"),
        ),
        migrations.RunPython(flag_referenced, migrations.RunPython.noop),
    ]
