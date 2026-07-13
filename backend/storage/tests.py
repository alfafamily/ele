import io

from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.test import override_settings
from PIL import Image
from rest_framework.test import APITestCase

from accounts.models import User
from company.models import Company


def _make_png(width: int, height: int) -> SimpleUploadedFile:
    buf = io.BytesIO()
    Image.new("RGB", (width, height), color="white").save(buf, format="PNG")
    buf.seek(0)
    return SimpleUploadedFile("logo.png", buf.read(), content_type="image/png")

from . import backends as storage_backends
from .backends import StorageBackend
from .models import StoredFile
from .service import store_uploaded_file

_S3_ENV = {
    "S3_ENDPOINT": "https://s3.test.example",
    "S3_BUCKET": "test-bucket",
    "S3_REGION": "ru-central1",
    "S3_ACCESS_KEY": "AKIA_TEST",
    "S3_SECRET_KEY": "secret",
}


class FakeBackend(StorageBackend):
    """Тестовый двойник — без реального diска/сети, чтобы проверить именно
    логику движка миграции (core/eav.py и Local/S3 бэкенды уже
    протестированы отдельно через реальные вызовы)."""

    def __init__(self, name):
        self.name = name
        self.files: dict[str, bytes] = {}

    def save(self, path, file_obj):
        self.files[path] = file_obj.read()
        return path

    def open(self, path):
        return io.BytesIO(self.files[path])

    def delete(self, path):
        self.files.pop(path, None)

    def exists(self, path):
        return path in self.files

    def url(self, path):
        return f"/{self.name}/{path}"


@override_settings(**_S3_ENV)
class StorageMigrationTests(APITestCase):
    """Чек-лист «Готово когда» Фазы 5: смена режима запускает миграцию по
    расписанию; файл, загруженный во время миграции, сразу на целевом
    хранилище; повтор после ошибки трогает только неудавшиеся файлы; после
    завершения старые файлы удалены, ссылки резолвятся на новом хранилище."""

    def setUp(self):
        self.local = FakeBackend("local")
        self.s3 = FakeBackend("s3")
        storage_backends._INSTANCES["local"] = self.local
        storage_backends._INSTANCES["s3"] = self.s3
        self.admin = User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=self.admin)
        Company.load()  # storage_mode по умолчанию "local"

    def tearDown(self):
        storage_backends._INSTANCES.clear()

    def test_upload_goes_to_current_target_backend(self):
        stored = store_uploaded_file(SimpleUploadedFile("test.txt", b"hello"), "test")
        self.assertEqual(stored.backend, "local")
        self.assertIn(stored.path, self.local.files)

    def test_mode_switch_triggers_scheduled_migration(self):
        stored = store_uploaded_file(SimpleUploadedFile("a.txt", b"content-a"), "test")
        self.assertEqual(stored.backend, "local")

        resp = self.client.patch("/api/company/storage-mode/", {"storage_mode": "s3"}, format="json")
        self.assertEqual(resp.status_code, 200, resp.data)

        resp = self.client.get("/api/company/storage-migration-status/")
        self.assertEqual(resp.data["pending_count"], 1)
        self.assertEqual(resp.data["status"], "in_progress")

        # Файл, загруженный ПОСЛЕ смены режима, сразу на целевом хранилище —
        # не ждёт своей очереди в переносе (§8.3).
        stored2 = store_uploaded_file(SimpleUploadedFile("b.txt", b"content-b"), "test")
        self.assertEqual(stored2.backend, "s3")
        self.assertIn(stored2.path, self.s3.files)

        call_command("migrate_storage_files")  # то, что запускает cron по расписанию

        stored.refresh_from_db()
        self.assertEqual(stored.backend, "s3")
        self.assertEqual(stored.migration_status, StoredFile.MigrationStatus.DONE)
        self.assertIn(stored.path, self.s3.files)
        self.assertNotIn(stored.path, self.local.files)  # исходник удалён

        resp = self.client.get("/api/company/storage-migration-status/")
        self.assertEqual(resp.data["pending_count"], 0)
        self.assertEqual(resp.data["status"], "idle")

    def test_switch_to_s3_blocked_without_env_vars(self):
        with override_settings(S3_ENDPOINT="", S3_BUCKET="", S3_REGION="", S3_ACCESS_KEY="", S3_SECRET_KEY=""):
            resp = self.client.patch("/api/company/storage-mode/", {"storage_mode": "s3"}, format="json")
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(Company.load().storage_mode, "local")

    def test_failed_migration_then_retry_only_touches_errors(self):
        stored = store_uploaded_file(SimpleUploadedFile("a.txt", b"content-a"), "test")
        stored_ok = store_uploaded_file(SimpleUploadedFile("ok.txt", b"content-ok"), "test")
        company = Company.load()
        company.storage_mode = "s3"
        company.save()

        original_save = self.s3.save
        self.s3.save = lambda path, file_obj: (_ for _ in ()).throw(OSError("network down"))

        call_command("migrate_storage_files")
        stored.refresh_from_db()
        stored_ok.refresh_from_db()
        self.assertEqual(stored.migration_status, StoredFile.MigrationStatus.ERROR)
        self.assertEqual(stored_ok.migration_status, StoredFile.MigrationStatus.ERROR)
        self.assertIn(stored.path, self.local.files)  # исходники целы после ошибки

        # Повторный тик без ретрая — ошибочные файлы не трогаются повторно.
        call_command("migrate_storage_files")
        stored.refresh_from_db()
        self.assertEqual(stored.migration_status, StoredFile.MigrationStatus.ERROR)

        self.s3.save = original_save
        resp = self.client.post("/api/company/storage-migration-retry/")
        self.assertEqual(resp.status_code, 200, resp.data)

        call_command("migrate_storage_files")
        stored.refresh_from_db()
        stored_ok.refresh_from_db()
        self.assertEqual(stored.backend, "s3")
        self.assertEqual(stored.migration_status, StoredFile.MigrationStatus.DONE)
        self.assertEqual(stored_ok.backend, "s3")

    def test_reference_stays_stable_across_migration(self):
        """§8.3: обновляется только сама строка StoredFile — ссылающийся
        объект (Employee.avatar) не трогается, продолжает резолвиться."""
        from employees.models import Employee

        stored = store_uploaded_file(SimpleUploadedFile("avatar.png", b"fake-image-bytes"), "employees/avatars")
        employee = Employee.objects.create(first_name="Иван", last_name="Прозоров", avatar=stored)

        company = Company.load()
        company.storage_mode = "s3"
        company.save()
        call_command("migrate_storage_files")

        employee.refresh_from_db()
        self.assertEqual(employee.avatar_id, stored.id)
        self.assertEqual(employee.avatar.backend, "s3")
        self.assertTrue(employee.avatar.url.startswith("/s3/"))

    def test_migration_status_requires_admin(self):
        worker = User.objects.create_user(email="worker@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=worker)
        resp = self.client.get("/api/company/storage-migration-status/")
        self.assertEqual(resp.status_code, 403)


class CompanyLogoUploadTests(APITestCase):
    def setUp(self):
        storage_backends._INSTANCES["local"] = FakeBackend("local")
        self.admin = User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=self.admin)

    def tearDown(self):
        storage_backends._INSTANCES.clear()

    def test_upload_and_replace_logo(self):
        resp = self.client.post("/api/company/logo/", {"file": _make_png(200, 200)}, format="multipart")
        self.assertEqual(resp.status_code, 200, resp.data)
        first_id = resp.data["id"]
        self.assertEqual(StoredFile.objects.count(), 1)

        resp = self.client.post("/api/company/logo/", {"file": _make_png(300, 300)}, format="multipart")
        self.assertEqual(resp.status_code, 200, resp.data)
        # Старый StoredFile удалён, не просто отвязан.
        self.assertFalse(StoredFile.objects.filter(id=first_id).exists())
        self.assertEqual(StoredFile.objects.count(), 1)

    def test_oversized_logo_rejected(self):
        resp = self.client.post("/api/company/logo/", {"file": _make_png(800, 601)}, format="multipart")
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(StoredFile.objects.count(), 0)
