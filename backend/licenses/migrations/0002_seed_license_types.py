"""Сеет два базовых Типа лицензии как деплой-синглтоны —
физически не удаляемые/не архивируемые, имя не редактируется (is_locked)."""
from django.db import migrations


def seed_license_types(apps, schema_editor):
    LicenseType = apps.get_model("licenses", "LicenseType")
    LicenseTypeField = apps.get_model("licenses", "LicenseTypeField")

    software, _ = LicenseType.objects.get_or_create(
        name="Программная", defaults={"is_locked": True, "is_archived": False}
    )
    if not software.is_locked:
        software.is_locked = True
        software.save(update_fields=["is_locked"])

    LicenseTypeField.objects.get_or_create(
        license_type=software,
        name="Номер/ключ",
        defaults={"value_type": "text", "is_required": True, "is_locked": True},
    )

    hardware, _ = LicenseType.objects.get_or_create(
        name="Аппаратная", defaults={"is_locked": True, "is_archived": False}
    )
    if not hardware.is_locked:
        hardware.is_locked = True
        hardware.save(update_fields=["is_locked"])


def unseed_license_types(apps, schema_editor):
    # Намеренно no-op: откат сеанса не должен удалять базовые Типы, если на
    # них уже успели завестись Лицензии в момент отката.
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("licenses", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(seed_license_types, unseed_license_types),
    ]
