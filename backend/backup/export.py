"""Экспорт системы в резервную копию.

Два формата:
- v2 (актуальный, B29): ПОЛНЫЙ дамп БД через Django dumpdata всех приложений
  (`dump_database`) + бинарники файлов внутрь архива + manifest со снимком версии
  схемы (миграции) и приложения. Собирается в backup/archive.py.
- v1 (устаревший): `build_backup_data()` — ручной перечень моделей в JSON, файлы
  ссылками. Сохранён только для чтения старых копий командой restore_backup."""
import json

from django.core import serializers
from django.core.management import call_command
from django.db import connection
from django.db.migrations.recorder import MigrationRecorder
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

# --- v2: полный дамп БД (B29) ---

# Эти приложения/модели ИСКЛЮЧАЕМ из dumpdata: contenttypes и auth.permission
# пересоздаются автоматически (post_migrate) на целевом инстансе, а их загрузка
# поверх уже созданных строк вызывает конфликты уникальности; admin.logentry и
# sessions — эфемерный журнал/сессии, бессмысленны в аварийной копии; auth.group
# опущена, т.к. её M2M group_permissions ссылается на permission по pk; backup —
# метаданные самих копий (операционная история инстанса, не бизнес-данные;
# включать их в копию — циклично).
# Historical* (django-simple-history) НЕ исключаем — история входит в копию.
DUMPDATA_EXCLUDE = [
    "contenttypes",
    "auth.permission",
    "auth.group",
    "admin.logentry",
    "sessions.session",
    "backup",
]

# Файлы резервных копий лежат в этом подкаталоге хранилища. Их НЕ кладём внутрь
# новой копии (иначе каждый бэкап тащил бы в себе все предыдущие — рост лавиной).
BACKUP_SUBDIR = "backups"


def dump_database(out_stream) -> None:
    """Пишет полный дамп БД (JSON, loaddata-совместимо) в поток out_stream.
    БЕЗ natural keys — сохранение исходных PK критично: FK на StoredFile
    (avatar, файлы-реквизиты) и вся связность восстанавливаются по pk."""
    call_command(
        "dumpdata",
        exclude=DUMPDATA_EXCLUDE,
        format="json",
        stdout=out_stream,
        use_natural_foreign_keys=False,
        use_natural_primary_keys=False,
    )


def migration_state() -> dict:
    """Снимок применённых миграций {app_label: [migration_name, ...]} — это и
    есть «версия схемы». При восстановлении сравнивается с состоянием целевого
    инстанса: расхождение = loaddata может упасть на незнакомых полях."""
    applied = MigrationRecorder(connection).applied_migrations()
    out: dict[str, list[str]] = {}
    for app_label, name in applied:
        out.setdefault(app_label, []).append(name)
    for names in out.values():
        names.sort()
    return out


def read_version_file() -> str:
    """Версия приложения — единый источник core.version (файл VERSION,
    монтируется в контейнер как BASE_DIR/VERSION)."""
    from core.version import get_current_version

    return get_current_version()


def build_manifest(*, db_bytes: int, files_meta: list[dict], encrypted: bool) -> dict:
    """Метаданные копии внутри архива: версия формата/приложения/схемы, счётчики,
    перечень файлов (pk/backend/path/checksum/size/arcname/missing)."""
    return {
        "format_version": 2,
        "app_version": read_version_file(),
        "schema_version": migration_state(),
        "created_at": timezone.now().isoformat(),
        "encrypted": encrypted,
        "counts": {"db_bytes": db_bytes, "files": len(files_meta)},
        "files": files_meta,
    }


# --- v1 (устаревший): ручной перечень моделей, файлы ссылками ---


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
