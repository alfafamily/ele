from django.db import migrations


def delete_quantity_equipment(apps, schema_editor):
    # Количественный учёт убран из Оборудования (переехал в раздел «Инструменты»).
    # Количественные карточки отличались пустым учётным номером — удаляем их
    # (вместе со связями по CASCADE), чтобы затем восстановить полную уникальность
    # inventory_number. Поэкземплярные карточки всегда имеют непустой номер.
    # Отдельной миграцией от схемных изменений: удаление + ALTER TABLE в одной
    # транзакции Postgres даёт «pending trigger events».
    Equipment = apps.get_model("equipment", "Equipment")
    Equipment.objects.filter(inventory_number="").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("equipment", "0009_remove_equipment_uniq_equipment_inventory_and_more"),
    ]

    operations = [
        migrations.RunPython(delete_quantity_equipment, migrations.RunPython.noop),
    ]
