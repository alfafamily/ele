from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("employees", "0007_accesspass_is_utilized_accesspass_object_type_and_more"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="accesspass",
            name="name",
        ),
        migrations.RemoveField(
            model_name="historicalaccesspass",
            name="name",
        ),
    ]
