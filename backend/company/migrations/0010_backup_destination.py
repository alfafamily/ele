# B29: единый выбор назначения авто-копий вместо флага + отдельной глубины.
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("company", "0009_company_backup_secondary_s3"),
    ]

    operations = [
        migrations.RemoveField(model_name="company", name="backup_secondary_s3_enabled"),
        migrations.RemoveField(model_name="company", name="backup_secondary_s3_retention"),
        migrations.AddField(
            model_name="company",
            name="auto_backup_destination",
            field=models.CharField(
                choices=[("own", "Хранилище приложения"), ("secondary_s3", "Отдельный S3 для бэкапов")],
                default="own",
                max_length=16,
                verbose_name="Назначение авто-копий",
            ),
        ),
    ]
