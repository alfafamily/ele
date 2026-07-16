"""Аналог «Номер/ключ» для базового Типа «Аппаратная»: зафиксированный
(is_locked) обязательный текстовый реквизит «Номер/ID/Serial токена». Секретный
(маскируется, скрыт в списках) и уникальный — логика по is_locked в сериализаторе."""
from django.db import migrations


def seed_hardware_token(apps, schema_editor):
    LicenseType = apps.get_model("licenses", "LicenseType")
    LicenseTypeField = apps.get_model("licenses", "LicenseTypeField")
    hardware = LicenseType.objects.filter(name="Аппаратная").first()
    if not hardware:
        return
    LicenseTypeField.objects.get_or_create(
        license_type=hardware,
        name="Номер/ID/Serial токена",
        defaults={"value_type": "text", "is_required": True, "is_locked": True},
    )


def unseed_hardware_token(apps, schema_editor):
    # Намеренно no-op: откат не должен удалять базовый реквизит, если на
    # Аппаратных лицензиях уже успели завести серийники.
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("licenses", "0006_licensetypefield_allow_multiple_and_more"),
    ]

    operations = [
        migrations.RunPython(seed_hardware_token, unseed_hardware_token),
    ]
