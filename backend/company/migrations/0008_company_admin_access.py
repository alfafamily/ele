"""B9: контролируемый доступ в служебную Django-админку.

Флаг доступа (по умолчанию выключен — раздел закрыт) и отдельный список
разрешённых IP для админ-панели."""
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("company", "0007_company_open_registration"),
    ]

    operations = [
        migrations.AddField(
            model_name="company",
            name="admin_access_enabled",
            field=models.BooleanField(default=False, verbose_name="Доступ к админ-панели Django"),
        ),
        migrations.AddField(
            model_name="company",
            name="admin_access_ips",
            field=models.JSONField(blank=True, default=list, verbose_name="Разрешённые IP админ-панели"),
        ),
    ]
