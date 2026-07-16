"""«Номер/ключ» у Программной лицензии становится необязательным: лицензий без
ключа может быть несколько, а уникальность проверяется только для заполненных
(логика в LicenseSerializer). Ранее реквизит был обязательным (is_required=True)."""
from django.db import migrations


def make_key_optional(apps, schema_editor):
    LicenseTypeField = apps.get_model("licenses", "LicenseTypeField")
    LicenseTypeField.objects.filter(
        license_type__name="Программная", name="Номер/ключ", is_locked=True
    ).update(is_required=False)


def make_key_required(apps, schema_editor):
    LicenseTypeField = apps.get_model("licenses", "LicenseTypeField")
    LicenseTypeField.objects.filter(
        license_type__name="Программная", name="Номер/ключ", is_locked=True
    ).update(is_required=True)


class Migration(migrations.Migration):
    dependencies = [
        ("licenses", "0006_licensetypefield_allow_multiple_and_more"),
    ]

    operations = [
        migrations.RunPython(make_key_optional, make_key_required),
    ]
