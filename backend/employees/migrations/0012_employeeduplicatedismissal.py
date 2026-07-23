from django.conf import settings
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("employees", "0011_accesspass_storage_place_and_more"),
    ]

    operations = [
        migrations.CreateModel(
            name="EmployeeDuplicateDismissal",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("signature", models.CharField(max_length=255, unique=True, verbose_name="Подпись группы")),
                ("member_ids", models.JSONField(default=list, verbose_name="Участники")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "created_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="+",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "verbose_name": "Пометка «не дубль»",
                "verbose_name_plural": "Пометки «не дубль»",
            },
        ),
    ]
