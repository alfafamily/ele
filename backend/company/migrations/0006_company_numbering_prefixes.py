from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('company', '0005_remove_company_kpp'),
    ]

    operations = [
        migrations.AddField(
            model_name='company',
            name='equipment_number_prefix',
            field=models.CharField(default='EQUIP', max_length=16, verbose_name='Префикс номеров оборудования'),
        ),
        migrations.AddField(
            model_name='company',
            name='key_number_prefix',
            field=models.CharField(default='KEY', max_length=16, verbose_name='Префикс номеров ключей'),
        ),
        migrations.AddField(
            model_name='company',
            name='pass_number_prefix',
            field=models.CharField(default='PASS', max_length=16, verbose_name='Префикс номеров пропусков'),
        ),
        migrations.AddField(
            model_name='company',
            name='equipment_number_seq',
            field=models.PositiveIntegerField(default=0, verbose_name='Счётчик номеров оборудования'),
        ),
        migrations.AddField(
            model_name='company',
            name='key_number_seq',
            field=models.PositiveIntegerField(default=0, verbose_name='Счётчик номеров ключей'),
        ),
        migrations.AddField(
            model_name='company',
            name='pass_number_seq',
            field=models.PositiveIntegerField(default=0, verbose_name='Счётчик номеров пропусков'),
        ),
    ]
