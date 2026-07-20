"""v1.10.1: подчистить «осиротевшие» значения реквизитов лицензий.

На инстансах, обновившихся на 1.10.0, при «мягкой» смене Типа лицензии значения
реквизитов прежнего Типа не удалялись — на карточке мог показываться лишний
реквизит (например, второй «Номер/ключ»). Удаляем значения, чей реквизит
принадлежит не текущему Типу лицензии. Идемпотентно (на чистых данных — no-op).
"""
from django.db import migrations
from django.db.models import F


def cleanup_orphaned(apps, schema_editor):
    LicenseFieldValue = apps.get_model("licenses", "LicenseFieldValue")
    LicenseFieldValue.objects.exclude(field__license_type=F("license__license_type")).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("licenses", "0011_b18_migrate_license_types"),
    ]

    operations = [
        migrations.RunPython(cleanup_orphaned, migrations.RunPython.noop),
    ]
