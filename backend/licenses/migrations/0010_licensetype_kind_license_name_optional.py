"""B18, схема: «вид» (программная/аппаратная) у Типа лицензии + Наименование
лицензии становится необязательным (идентификация теперь по Типу)."""
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("licenses", "0009_historicallicense_storage_place_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="licensetype",
            name="kind",
            field=models.CharField(
                choices=[("software", "Программная"), ("hardware", "Аппаратная")],
                default="software",
                max_length=10,
                verbose_name="Вид",
            ),
        ),
        migrations.AlterField(
            model_name="license",
            name="name",
            field=models.CharField(blank=True, default="", max_length=255, verbose_name="Наименование"),
        ),
        migrations.AlterField(
            model_name="historicallicense",
            name="name",
            field=models.CharField(blank=True, default="", max_length=255, verbose_name="Наименование"),
        ),
    ]
