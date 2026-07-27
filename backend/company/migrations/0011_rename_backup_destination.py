# Единое назначение резервных копий (и ручных, и авто): переименование поля
# auto_backup_destination → backup_destination + актуализация choices/verbose.
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("company", "0010_backup_destination"),
    ]

    operations = [
        migrations.RenameField(
            model_name="company",
            old_name="auto_backup_destination",
            new_name="backup_destination",
        ),
        migrations.AlterField(
            model_name="company",
            name="backup_destination",
            field=models.CharField(
                choices=[("own", "Хранилище приложения"), ("secondary_s3", "S3 для backup")],
                default="own",
                max_length=16,
                verbose_name="Хранилище резервных копий",
            ),
        ),
    ]
