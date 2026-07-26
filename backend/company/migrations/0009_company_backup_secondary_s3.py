# B29: флаг и глубина хранения для резервного (стороннего) S3.
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("company", "0008_company_admin_access"),
    ]

    operations = [
        migrations.AddField(
            model_name="company",
            name="backup_secondary_s3_enabled",
            field=models.BooleanField(default=False, verbose_name="Выгружать копии на резервный S3"),
        ),
        migrations.AddField(
            model_name="company",
            name="backup_secondary_s3_retention",
            field=models.PositiveSmallIntegerField(default=30, verbose_name="Хранить копий на резервном S3"),
        ),
    ]
