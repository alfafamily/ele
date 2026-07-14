"""Полный экспорт системы: Компания, Пользователи (с хэшем
пароля — осознанно, для восстановления без сброса паролей), Сотрудники,
Оборудование, Лицензии, Типы и Реквизиты. Файлы — ссылками (StoredFile +
живой .url на момент экспорта), не бинарными вложениями."""
import json

from django.core import serializers
from django.utils import timezone

from accounts.models import User
from company.models import Company
from employees.models import Employee
from equipment.models import (
    Equipment,
    EquipmentCustomField,
    EquipmentFieldValue,
    EquipmentType,
    EquipmentTypeField,
)
from licenses.models import (
    License,
    LicenseCustomField,
    LicenseFieldValue,
    LicenseType,
    LicenseTypeField,
)
from storage.models import StoredFile


def _dump(queryset):
    # format="python" отдаёт значения полей как есть (datetime.time и т.п. —
    # не JSON-совместимо напрямую); "json" прогоняет через DjangoJSONEncoder
    # (умеет time/date/datetime/Decimal/UUID), затем разбираем обратно в
    # python-структуры, чтобы собрать один общий словарь под финальный dumps().
    return json.loads(serializers.serialize("json", queryset))


def build_backup_data() -> dict:
    stored_files = list(StoredFile.objects.all())
    stored_files_data = _dump(stored_files)
    for entry, obj in zip(stored_files_data, stored_files):
        # "Ссылка на хранимый файл" — снимок URL на момент экспорта;
        # не поле модели, restore_backup эту пару ключ/значение отбрасывает.
        entry["fields"]["url"] = obj.url

    return {
        "exported_at": timezone.now().isoformat(),
        "company": _dump(Company.objects.all()),
        "users": _dump(User.objects.all()),
        "employees": _dump(Employee.objects.all()),
        "equipment_types": _dump(EquipmentType.objects.all()),
        "equipment_type_fields": _dump(EquipmentTypeField.objects.all()),
        "equipment": _dump(Equipment.objects.all()),
        "equipment_field_values": _dump(EquipmentFieldValue.objects.all()),
        "equipment_custom_fields": _dump(EquipmentCustomField.objects.all()),
        "license_types": _dump(LicenseType.objects.all()),
        "license_type_fields": _dump(LicenseTypeField.objects.all()),
        "licenses": _dump(License.objects.all()),
        "license_field_values": _dump(LicenseFieldValue.objects.all()),
        "license_custom_fields": _dump(LicenseCustomField.objects.all()),
        "stored_files": stored_files_data,
    }


# Порядок восстановления — по зависимостям FK (restore_backup.py использует
# тот же список). StoredFile первым (на него ссылаются Company/Employee/
# *FieldValue), Employee до Company/User (User.employee, но User не входит
# в зависимости Employee), Equipment после EquipmentType и Employee и т.д.
RESTORE_ORDER = [
    "stored_files",
    "employees",
    "company",
    "users",
    "equipment_types",
    "equipment_type_fields",
    "equipment",
    "equipment_field_values",
    "equipment_custom_fields",
    "license_types",
    "license_type_fields",
    "licenses",
    "license_field_values",
    "license_custom_fields",
]
