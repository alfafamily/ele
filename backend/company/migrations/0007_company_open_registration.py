"""B14: флаг «Открытая регистрация» у компании (по умолчанию включён —
сохраняет текущее поведение самостоятельной регистрации)."""
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("company", "0006_company_numbering_prefixes"),
    ]

    operations = [
        migrations.AddField(
            model_name="company",
            name="open_registration",
            field=models.BooleanField(default=True, verbose_name="Открытая регистрация"),
        ),
    ]
