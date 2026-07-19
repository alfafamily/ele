# Откат количественного учёта из Оборудования (перенесён в раздел «Инструменты»).
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('equipment', '0010_purge_quantity_equipment'),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name='equipmentallocation',
            name='uniq_equipment_allocation',
        ),
        migrations.RemoveField(
            model_name='equipmentmovement',
            name='created_by',
        ),
        migrations.RemoveField(
            model_name='equipmentmovement',
            name='employee',
        ),
        migrations.RemoveField(
            model_name='equipmentmovement',
            name='equipment',
        ),
        migrations.RemoveConstraint(
            model_name='equipment',
            name='uniq_equipment_inventory',
        ),
        migrations.RemoveField(
            model_name='equipmenttype',
            name='accounting_type',
        ),
        migrations.RemoveField(
            model_name='historicalequipment',
            name='quantity',
        ),
        migrations.AlterField(
            model_name='equipment',
            name='inventory_number',
            field=models.CharField(max_length=255, verbose_name='Учётный номер'),
        ),
        migrations.AlterField(
            model_name='historicalequipment',
            name='inventory_number',
            field=models.CharField(max_length=255, verbose_name='Учётный номер'),
        ),
        migrations.AddConstraint(
            model_name='equipment',
            constraint=models.UniqueConstraint(fields=('inventory_number',), name='uniq_equipment_inventory'),
        ),
        migrations.RemoveField(
            model_name='equipmentallocation',
            name='employee',
        ),
        migrations.RemoveField(
            model_name='equipmentallocation',
            name='equipment',
        ),
        migrations.DeleteModel(
            name='EquipmentMovement',
        ),
        migrations.RemoveField(
            model_name='equipment',
            name='quantity',
        ),
        migrations.DeleteModel(
            name='EquipmentAllocation',
        ),
    ]
