# B45: новый тип места «МОП» (common) — место общего пользования.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('locations', '0006_historicalplace_transport_and_more'),
    ]

    operations = [
        migrations.AlterField(
            model_name='historicalplace',
            name='place_type',
            field=models.CharField(choices=[('workplace', 'Рабочее место'), ('common', 'МОП'), ('storage', 'Место хранения'), ('parking_spot', 'Парковочное место')], default='workplace', max_length=12, verbose_name='Тип места'),
        ),
        migrations.AlterField(
            model_name='place',
            name='place_type',
            field=models.CharField(choices=[('workplace', 'Рабочее место'), ('common', 'МОП'), ('storage', 'Место хранения'), ('parking_spot', 'Парковочное место')], default='workplace', max_length=12, verbose_name='Тип места'),
        ),
    ]
