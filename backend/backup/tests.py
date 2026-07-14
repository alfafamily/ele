import json
import tempfile
from datetime import time

from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.test import override_settings
from rest_framework.test import APITestCase

from accounts.models import User
from company.models import Company
from employees.models import Employee
from equipment.models import Equipment, EquipmentType
from storage import backends as storage_backends
from storage.service import store_uploaded_file

from .models import BackupRecord
from .service import create_backup, run_scheduled_backup_if_due

# Тесты этого модуля пишут реальные файлы через LocalStorageBackend (не
# FakeBackend, как в storage/tests.py) — изолируем от dev-MEDIA_ROOT
# отдельным временным каталогом. get_backend() кеширует инстансы бэкендов
# на уровне модуля (storage/backends.py _INSTANCES), поэтому одного
# override_settings недостаточно — кеш нужно сбрасывать в setUp, иначе
# переиспользуется бэкенд, сконструированный под другой MEDIA_ROOT.
_TEST_MEDIA_ROOT = tempfile.mkdtemp(prefix="ele-backup-tests-")


def _reset_local_backend():
    storage_backends._INSTANCES.pop("local", None)


@override_settings(MEDIA_ROOT=_TEST_MEDIA_ROOT)
class ManualBackupTests(APITestCase):
    """Чек-лист «Готово когда»: ручной бэкап скачивается и валиден."""

    def setUp(self):
        _reset_local_backend()
        self.admin = User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=self.admin)
        Company.load()

    def test_create_and_download_is_valid_json_with_expected_sections(self):
        resp = self.client.post("/api/backup/create/")
        self.assertEqual(resp.status_code, 201, resp.data)
        backup_id = resp.data["id"]
        self.assertEqual(resp.data["backup_type"], "manual")
        self.assertGreater(resp.data["size"], 0)

        resp = self.client.get(f"/api/backup/{backup_id}/download/")
        self.assertEqual(resp.status_code, 200)
        content = b"".join(resp.streaming_content)
        data = json.loads(content)
        for key in ("company", "users", "employees", "equipment", "licenses", "stored_files"):
            self.assertIn(key, data)
        # Хэш пароля есть (осознанно, для восстановления), не в открытом виде.
        admin_entry = next(u for u in data["users"] if u["fields"]["email"] == "admin@example.com")
        self.assertTrue(
            admin_entry["fields"]["password"].startswith("pbkdf2_") or "$" in admin_entry["fields"]["password"]
        )
        self.assertNotIn("Str0ng!Pass1", admin_entry["fields"]["password"])

    def test_history_lists_backups(self):
        create_backup(BackupRecord.BackupType.MANUAL)
        create_backup(BackupRecord.BackupType.MANUAL)
        resp = self.client.get("/api/backup/history/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data["results"]), 2)

    def test_forbidden_for_non_admin(self):
        worker = User.objects.create_user(email="worker@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=worker)
        resp = self.client.post("/api/backup/create/")
        self.assertEqual(resp.status_code, 403)


@override_settings(MEDIA_ROOT=_TEST_MEDIA_ROOT)
class ScheduledBackupTests(APITestCase):
    """Чек-лист «Готово когда»: плановый бэкап срабатывает по расписанию и
    обрезает историю по глубине хранения."""

    def setUp(self):
        _reset_local_backend()
        self.admin = User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=self.admin)

    def test_disabled_by_default_produces_nothing(self):
        self.assertIsNone(run_scheduled_backup_if_due())
        self.assertEqual(BackupRecord.objects.count(), 0)

    def test_runs_when_enabled_and_time_has_passed(self):
        company = Company.load()
        company.auto_backup_enabled = True
        # Полночь — фиксированное время-суток, заведомо уже наступившее для
        # любого разумного момента запуска тестов (в отличие от "now - 1
        # минута", которое ломалось бы у полуночи из-за перехода через сутки
        # при сравнении только time-of-day, без даты).
        company.auto_backup_time = time(0, 0)
        company.save()

        record = run_scheduled_backup_if_due()
        self.assertIsNotNone(record)
        self.assertEqual(record.backup_type, BackupRecord.BackupType.AUTO)

        # Повторный тик в те же сутки — не создаёт вторую копию.
        self.assertIsNone(run_scheduled_backup_if_due())
        self.assertEqual(BackupRecord.objects.filter(backup_type=BackupRecord.BackupType.AUTO).count(), 1)

    def test_does_not_run_before_scheduled_time(self):
        company = Company.load()
        company.auto_backup_enabled = True
        # Без пяти полночь — фиксированное время-суток, заведомо ещё не
        # наступившее (симметрично предыдущему тесту).
        company.auto_backup_time = time(23, 59)
        company.save()
        self.assertIsNone(run_scheduled_backup_if_due())

    def test_retention_trims_old_auto_backups_only(self):
        company = Company.load()
        company.auto_backup_enabled = True
        company.auto_backup_retention = 2
        company.save()

        manual = create_backup(BackupRecord.BackupType.MANUAL)
        auto_ids = [create_backup(BackupRecord.BackupType.AUTO).id for _ in range(3)]

        from .service import _trim_auto_backups

        _trim_auto_backups(company.auto_backup_retention)

        remaining_auto = list(BackupRecord.objects.filter(backup_type=BackupRecord.BackupType.AUTO).order_by("id"))
        self.assertEqual(len(remaining_auto), 2)
        # Самая старая авто-копия обрезана, две последние остались.
        self.assertEqual([r.id for r in remaining_auto], auto_ids[1:])
        # Ручная копия retention не касается.
        self.assertTrue(BackupRecord.objects.filter(id=manual.id).exists())

    def test_management_command_runs_cleanly(self):
        call_command("run_scheduled_backup")  # выключено по умолчанию — не должно падать
        self.assertEqual(BackupRecord.objects.count(), 0)


@override_settings(MEDIA_ROOT=_TEST_MEDIA_ROOT, EMAIL_CONFIGURED=False)
class RestoreBackupTests(APITestCase):
    """Чек-лист «Готово когда»: restore_backup на чистой БД воспроизводит все
    объекты, включая рабочие логины и корректные файловые ссылки."""

    def setUp(self):
        _reset_local_backend()

    def test_full_roundtrip(self):
        company = Company.load()
        company.name = "Alpha Family"
        company.save()

        avatar = store_uploaded_file(SimpleUploadedFile("avatar.png", b"fake-avatar-bytes"), "employees/avatars")
        employee = Employee.objects.create(first_name="Иван", last_name="Прозоров", avatar=avatar)
        User.objects.create_user(email="worker@example.com", password="Correct!Pass1", employee=employee)

        eq_type = EquipmentType.objects.create(name="Ноутбук")
        Equipment.objects.create(inventory_number="INV-1", equipment_type=eq_type, employee=employee)

        record = create_backup(BackupRecord.BackupType.MANUAL)
        from storage.backends import get_backend

        backend = get_backend(record.file.backend)
        content = backend.open(record.file.path).read()

        with tempfile.NamedTemporaryFile(mode="wb", suffix=".json", delete=False) as tmp:
            tmp.write(content)
            tmp_path = tmp.name

        # "Чистая БД" — вайп бизнес-объектов bulk-delete (обходит защиту
        # инстанс-уровня на Company/LicenseType, что и нужно для теста).
        Equipment.objects.all().delete()
        EquipmentType.objects.all().delete()
        User.objects.all().delete()
        Employee.objects.all().delete()
        Company.objects.all().delete()
        from storage.models import StoredFile

        StoredFile.objects.all().delete()

        call_command("restore_backup", tmp_path)

        restored_company = Company.objects.get(pk=1)
        self.assertEqual(restored_company.name, "Alpha Family")

        restored_user = User.objects.get(email="worker@example.com")
        self.assertTrue(restored_user.check_password("Correct!Pass1"))  # рабочий логин

        restored_employee = Employee.objects.get(pk=employee.pk)
        self.assertEqual(restored_employee.avatar_id, avatar.pk)
        self.assertEqual(restored_employee.avatar.backend, avatar.backend)
        self.assertEqual(restored_employee.avatar.path, avatar.path)  # файловая ссылка корректна

        restored_equipment = Equipment.objects.get(inventory_number="INV-1")
        self.assertEqual(restored_equipment.employee_id, employee.pk)

    def test_restore_rejects_broken_file(self):
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as tmp:
            tmp.write("{not valid json")
            tmp_path = tmp.name
        with self.assertRaises(Exception):
            call_command("restore_backup", tmp_path)
