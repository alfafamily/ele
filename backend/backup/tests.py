import json
import os
import tarfile
import tempfile
from datetime import time
from unittest import mock

from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.test import override_settings
from rest_framework.test import APITestCase, APITransactionTestCase

from accounts.models import User
from company.models import Company
from employees.models import Employee
from equipment.models import Equipment, EquipmentType
from storage import backends as storage_backends
from storage.models import StoredFile
from storage.service import store_uploaded_file

from . import archive as archive_mod
from .models import BackupDestinationStatus, BackupRecord
from .service import create_backup, run_scheduled_backup_if_due

# Тесты этого модуля пишут реальные файлы через LocalStorageBackend — изолируем
# от dev-MEDIA_ROOT отдельным временным каталогом. get_backend() кеширует
# инстансы (storage/backends.py _INSTANCES), поэтому кеш сбрасываем в setUp.
_TEST_MEDIA_ROOT = tempfile.mkdtemp(prefix="ele-backup-tests-")


def _reset_local_backend():
    storage_backends._INSTANCES.pop("local", None)


def _download_own_to_temp(record: BackupRecord) -> str:
    """Скачивает own-копию из хранилища во временный файл, возвращает путь."""
    from storage.backends import get_backend

    backend = get_backend(record.file.backend)
    content = backend.open(record.file.path).read()
    suffix = ".tar.gz.enc" if record.encrypted else ".tar.gz"
    with tempfile.NamedTemporaryFile(mode="wb", suffix=suffix, delete=False) as tmp:
        tmp.write(content)
        return tmp.name


def _wipe_business_data():
    Equipment.objects.all().delete()
    EquipmentType.objects.all().delete()
    User.objects.all().delete()
    Employee.objects.all().delete()
    Company.objects.all().delete()
    StoredFile.objects.all().delete()


@override_settings(MEDIA_ROOT=_TEST_MEDIA_ROOT)
class ManualBackupTests(APITestCase):
    def setUp(self):
        _reset_local_backend()
        self.admin = User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=self.admin)
        Company.load()

    def test_create_and_download_is_valid_archive(self):
        resp = self.client.post("/api/backup/create/")
        self.assertEqual(resp.status_code, 201, resp.data)
        backup_id = resp.data["id"]
        self.assertEqual(resp.data["backup_type"], "manual")
        self.assertEqual(resp.data["format"], "v2_archive")
        self.assertGreater(resp.data["size"], 0)
        # Own-назначение отработало.
        own = next(d for d in resp.data["destinations"] if d["destination"] == "own")
        self.assertTrue(own["ok"])

        resp = self.client.get(f"/api/backup/{backup_id}/download/")
        self.assertEqual(resp.status_code, 200)
        content = b"".join(resp.streaming_content)
        with tempfile.NamedTemporaryFile(mode="wb", suffix=".tar.gz", delete=False) as tmp:
            tmp.write(content)
            tmp_path = tmp.name

        with tarfile.open(tmp_path, "r:gz") as tar:
            names = tar.getnames()
            self.assertIn("db.json", names)
            self.assertIn("manifest.json", names)
            manifest = json.loads(tar.extractfile("manifest.json").read())
            self.assertEqual(manifest["format_version"], 2)
            self.assertIn("schema_version", manifest)
            db = json.loads(tar.extractfile("db.json").read())

        # Полный дамп: есть модели из разных приложений (не только «избранных»).
        models = {row["model"] for row in db}
        self.assertIn("company.company", models)
        self.assertIn("accounts.user", models)
        # Хэш пароля есть (осознанно), не открытым текстом.
        admin_row = next(r for r in db if r["model"] == "accounts.user" and r["fields"]["email"] == "admin@example.com")
        self.assertNotIn("Str0ng!Pass1", admin_row["fields"]["password"])
        self.assertTrue("$" in admin_row["fields"]["password"] or admin_row["fields"]["password"].startswith("pbkdf2_"))

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

    def test_backup_does_not_embed_previous_backups(self):
        # Первые копии создают архивы в backups/. Новая копия НЕ должна вбирать их.
        create_backup(BackupRecord.BackupType.MANUAL)
        create_backup(BackupRecord.BackupType.MANUAL)
        result = archive_mod.build_archive(None)
        try:
            for entry in result.manifest["files"]:
                self.assertFalse(entry["path"].startswith("backups/"), entry["path"])
        finally:
            if os.path.exists(result.path):
                os.remove(result.path)


@override_settings(MEDIA_ROOT=_TEST_MEDIA_ROOT)
class ScheduledBackupTests(APITestCase):
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
        company.auto_backup_time = time(0, 0)
        company.save()

        record = run_scheduled_backup_if_due()
        self.assertIsNotNone(record)
        self.assertEqual(record.backup_type, BackupRecord.BackupType.AUTO)

        self.assertIsNone(run_scheduled_backup_if_due())
        self.assertEqual(BackupRecord.objects.filter(backup_type=BackupRecord.BackupType.AUTO).count(), 1)

    def test_does_not_run_before_scheduled_time(self):
        company = Company.load()
        company.auto_backup_enabled = True
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

        _trim_auto_backups(company)

        remaining_auto = list(BackupRecord.objects.filter(backup_type=BackupRecord.BackupType.AUTO).order_by("id"))
        self.assertEqual(len(remaining_auto), 2)
        self.assertEqual([r.id for r in remaining_auto], auto_ids[1:])
        self.assertTrue(BackupRecord.objects.filter(id=manual.id).exists())

    def test_management_command_runs_cleanly(self):
        call_command("run_scheduled_backup")
        self.assertEqual(BackupRecord.objects.count(), 0)


@override_settings(MEDIA_ROOT=_TEST_MEDIA_ROOT, EMAIL_CONFIGURED=False)
class RestoreBackupTests(APITransactionTestCase):
    """restore_backup v2: полная замена, файлы восстановлены байт-в-байт.

    Транзакционный класс (не APITestCase): команда restore вызывает flush →
    TRUNCATE, а его нельзя выполнить внутри обёртки-транзакции обычного TestCase
    (PostgreSQL: «cannot TRUNCATE … has pending trigger events»)."""

    def setUp(self):
        _reset_local_backend()

    def _seed(self):
        company = Company.load()
        company.name = "Alpha Family"
        company.save()
        avatar = store_uploaded_file(SimpleUploadedFile("avatar.png", b"fake-avatar-bytes"), "employees/avatars")
        employee = Employee.objects.create(first_name="Иван", last_name="Прозоров", avatar=avatar)
        User.objects.create_user(email="worker@example.com", password="Correct!Pass1", employee=employee)
        eq_type = EquipmentType.objects.create(name="Ноутбук")
        Equipment.objects.create(inventory_number="INV-1", equipment_type=eq_type, employee=employee)
        return avatar, employee

    def test_full_roundtrip_restores_file_bytes(self):
        avatar, employee = self._seed()
        record = create_backup(BackupRecord.BackupType.MANUAL)
        tmp_path = _download_own_to_temp(record)

        _wipe_business_data()

        call_command("restore_backup", tmp_path, "--noinput", "--no-safety-backup")

        self.assertEqual(Company.objects.get(pk=1).name, "Alpha Family")
        restored_user = User.objects.get(email="worker@example.com")
        self.assertTrue(restored_user.check_password("Correct!Pass1"))

        restored_employee = Employee.objects.get(pk=employee.pk)
        self.assertEqual(restored_employee.avatar_id, avatar.pk)
        # Бинарник аватара реально восстановлен (не только ссылка).
        from storage.backends import get_backend

        sf = restored_employee.avatar
        content = get_backend(sf.backend).open(sf.path).read()
        self.assertEqual(content, b"fake-avatar-bytes")

        self.assertEqual(Equipment.objects.get(inventory_number="INV-1").employee_id, employee.pk)

    def test_restore_is_full_replace(self):
        self._seed()
        record = create_backup(BackupRecord.BackupType.MANUAL)
        tmp_path = _download_own_to_temp(record)

        # Данные, созданные ПОСЛЕ копии, должны исчезнуть после восстановления.
        extra_type = EquipmentType.objects.create(name="Мышь")
        Equipment.objects.create(inventory_number="INV-EXTRA", equipment_type=extra_type)

        call_command("restore_backup", tmp_path, "--noinput", "--no-safety-backup")

        self.assertTrue(Equipment.objects.filter(inventory_number="INV-1").exists())
        self.assertFalse(Equipment.objects.filter(inventory_number="INV-EXTRA").exists())

    def test_safety_backup_created_before_replace(self):
        self._seed()
        record = create_backup(BackupRecord.BackupType.MANUAL)
        tmp_path = _download_own_to_temp(record)
        # Файл страховочной копии создаётся в хранилище перед flush (сама запись
        # BackupRecord затем вычищается flush'ем — проверяем факт вызова).
        with mock.patch("backup.service.build_archive", wraps=archive_mod.build_archive) as spy:
            call_command("restore_backup", tmp_path, "--noinput")
        self.assertTrue(spy.called)  # страховочная копия собиралась

    def test_encrypted_roundtrip(self):
        self._seed()
        record = create_backup(BackupRecord.BackupType.MANUAL, passphrase="s3cret-pass")
        self.assertTrue(record.encrypted)
        tmp_path = _download_own_to_temp(record)
        self.assertTrue(archive_mod.is_encrypted(tmp_path))

        _wipe_business_data()
        # Неверный пароль — падение.
        with self.assertRaises(Exception):
            call_command("restore_backup", tmp_path, "--noinput", "--no-safety-backup", "--passphrase", "wrong")
        # Верный пароль — успех.
        call_command("restore_backup", tmp_path, "--noinput", "--no-safety-backup", "--passphrase", "s3cret-pass")
        self.assertEqual(Company.objects.get(pk=1).name, "Alpha Family")

    def test_schema_mismatch_blocks_without_flag(self):
        self._seed()
        record = create_backup(BackupRecord.BackupType.MANUAL)
        tmp_path = _download_own_to_temp(record)
        # Подменяем manifest.schema_version на несуществующую миграцию.
        tampered = _tamper_manifest(tmp_path, {"schema_version": {"company": ["9999_bogus"]}})

        with self.assertRaises(Exception):
            call_command("restore_backup", tampered, "--noinput", "--no-safety-backup")
        # С флагом — проходит.
        call_command("restore_backup", tampered, "--noinput", "--no-safety-backup", "--allow-schema-mismatch")

    def test_restore_rejects_broken_file(self):
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as tmp:
            tmp.write("{not valid json")
            tmp_path = tmp.name
        with self.assertRaises(Exception):
            call_command("restore_backup", tmp_path, "--noinput")

    def test_history_with_m2m_roundtrip_and_sequences_reset(self):
        """Регресс: у AccessPass история с m2m_fields. При loaddata сигнал
        m2m_changed (не защищённый от raw) порождал лишнюю строку истории по
        последовательности, сброшенной flush в 1, — та сталкивалась с явным
        history_id из дампа (IntegrityError на historicalaccesspass_pkey).
        История отключается на время загрузки; после — последовательности
        приводятся к max+1, иначе новая запись падала бы на дубликате PK."""
        from employees.models import AccessPass
        from locations.models import Building

        self._seed()
        building = Building.objects.create(name="Штаб")
        ap = AccessPass.objects.create(object_type=AccessPass.ObjectType.PASS)
        ap.buildings.add(building)  # правка m2m => отдельная запись истории
        history_before = ap.history.count()
        self.assertGreaterEqual(history_before, 2)  # создание + правка m2m

        record = create_backup(BackupRecord.BackupType.MANUAL)
        tmp_path = _download_own_to_temp(record)

        # Раньше следующая строка падала с IntegrityError.
        call_command("restore_backup", tmp_path, "--noinput", "--no-safety-backup")

        restored = AccessPass.objects.get(pk=ap.pk)
        self.assertEqual(list(restored.buildings.values_list("pk", flat=True)), [building.pk])
        # История сохранена как есть — без лишних строк от loaddata.
        self.assertEqual(restored.history.count(), history_before)
        # Последовательности сброшены: новая запись (и её строка истории)
        # получает свободный ключ, а не 1.
        new_ap = AccessPass.objects.create(object_type=AccessPass.ObjectType.KEY)
        self.assertNotEqual(new_ap.pk, ap.pk)
        self.assertTrue(new_ap.history.exists())


def _tamper_manifest(tar_path: str, overrides: dict) -> str:
    """Пересобирает архив, подменив поля manifest.json — для проверки схемы."""
    out = tempfile.NamedTemporaryFile(suffix=".tar.gz", delete=False).name
    with tarfile.open(tar_path, "r:gz") as src:
        manifest = json.loads(src.extractfile("manifest.json").read())
        manifest.update(overrides)
        with tarfile.open(out, "w:gz") as dst:
            for member in src.getmembers():
                if member.name == "manifest.json":
                    data = json.dumps(manifest).encode("utf-8")
                    member.size = len(data)
                    import io

                    dst.addfile(member, io.BytesIO(data))
                else:
                    dst.addfile(member, src.extractfile(member))
    return out


@override_settings(MEDIA_ROOT=_TEST_MEDIA_ROOT)
class SecondaryS3Tests(APITestCase):
    def setUp(self):
        _reset_local_backend()
        self.admin = User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=self.admin)
        Company.load()

    @override_settings(BACKUP_S3_ENDPOINT="", BACKUP_S3_BUCKET="")
    def test_secondary_test_endpoint_not_configured(self):
        resp = self.client.post("/api/backup/secondary-s3/test/")
        self.assertEqual(resp.status_code, 400)

    @override_settings(BACKUP_S3_ENDPOINT="", BACKUP_S3_BUCKET="")
    def test_manual_create_secondary_when_not_configured_400(self):
        resp = self.client.post("/api/backup/create/", {"destination": "secondary_s3"}, format="json")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("BACKUP_S3", resp.data["detail"])

    @override_settings(BACKUP_S3_ENDPOINT="", BACKUP_S3_BUCKET="")
    def test_auto_destination_secondary_when_not_configured_rejected(self):
        resp = self.client.patch(
            "/api/company/backup-settings/", {"auto_backup_destination": "secondary_s3"}, format="json"
        )
        self.assertEqual(resp.status_code, 400)

    def test_secondary_destination_upload_fails_no_own_copy(self):
        # Единственное назначение — резервный S3; он падает → file=None, статус
        # secondary_s3 ok=False, скачивание 409.
        with override_settings(
            BACKUP_S3_ENDPOINT="https://s3.example.com",
            BACKUP_S3_BUCKET="b",
            BACKUP_S3_REGION="r",
            BACKUP_S3_ACCESS_KEY="k",
            BACKUP_S3_SECRET_KEY="s",
        ):
            with mock.patch("backup.service.upload_secondary_s3") as up:
                from backup.destinations import UploadOutcome

                up.return_value = UploadOutcome(ok=False, error="boom")
                record = create_backup(BackupRecord.BackupType.MANUAL, destination="secondary_s3")

        status = record.destinations.get()
        self.assertEqual(status.destination, "secondary_s3")
        self.assertFalse(status.ok)
        self.assertEqual(status.error, "boom")
        self.assertIsNone(record.file)
        resp = self.client.get(f"/api/backup/{record.id}/download/")
        self.assertEqual(resp.status_code, 409)

    def test_download_conflict_when_own_missing(self):
        with mock.patch("backup.service.upload_own") as up:
            from backup.destinations import UploadOutcome

            up.return_value = UploadOutcome(ok=False, error="disk full")
            record = create_backup(BackupRecord.BackupType.MANUAL)
        self.assertIsNone(record.file)
        resp = self.client.get(f"/api/backup/{record.id}/download/")
        self.assertEqual(resp.status_code, 409)
