from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0009_maintenancereminderstate_pushsubscription_and_more"),
    ]

    operations = [
        migrations.AlterField(
            model_name="notificationpreference",
            name="kind",
            field=models.CharField(
                choices=[
                    ("assignment_pending", "Закрепление нового имущества"),
                    ("assignment_rejected", "Отказ от закрепления имущества"),
                    ("maintenance_due", "Подходящее ТО"),
                    ("maintenance_overdue", "Просроченное ТО"),
                    ("maintenance_performed", "Выполненное ТО"),
                ],
                max_length=32,
                verbose_name="Вид уведомления",
            ),
        ),
    ]
