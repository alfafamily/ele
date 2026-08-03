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
        # не ждёт своей очереди в переносе.
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
        """Обновляется только сама строка StoredFile — ссылающийся
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


# --- B33: свободное место по хранилищам ------------------------------------
from unittest import mock  # noqa: E402

from . import space as space_mod  # noqa: E402

_MB = 1024 * 1024
_GB = 1024 * _MB


class StorageSpaceTests(APITestCase):
    """B33: отчёт о свободном месте — Local через disk_usage, S3 через занятый
    объём и квоту из .env; предупреждение о нехватке при <500 МБ."""

    def setUp(self):
        space_mod._s3_used_cache.clear()

    def test_threshold_is_500mb(self):
        self.assertEqual(space_mod.STORAGE_LOW_THRESHOLD_BYTES, 500 * _MB)

    def test_local_reports_disk_usage_and_low_below_threshold(self):
        Company.load()  # local по умолчанию
        usage = mock.Mock(total=50 * _GB, free=200 * _MB, used=0)
        with mock.patch("storage.space.shutil.disk_usage", return_value=usage):
            report = space_mod.app_storage_space()
        self.assertEqual(report["kind"], "local")
        self.assertEqual(report["free_bytes"], 200 * _MB)
        self.assertEqual(report["total_bytes"], 50 * _GB)
        self.assertTrue(report["low"])  # 200 МБ < 500 МБ

    def test_local_not_low_when_plenty_free(self):
        Company.load()
        usage = mock.Mock(total=50 * _GB, free=10 * _GB, used=0)
        with mock.patch("storage.space.shutil.disk_usage", return_value=usage):
            report = space_mod.app_storage_space()
        self.assertFalse(report["low"])

    @override_settings(S3_QUOTA_GB=20)
    def test_s3_app_used_from_db_and_free_from_quota(self):
        company = Company.load()
        company.storage_mode = Company.StorageMode.S3
        company.save(update_fields=["storage_mode"])
        StoredFile.objects.create(backend="s3", path="a", size=8 * _GB)
        StoredFile.objects.create(backend="local", path="b", size=100 * _GB)  # не s3 — не учитывается
        report = space_mod.app_storage_space()
        self.assertEqual(report["kind"], "s3")
        self.assertEqual(report["used_bytes"], 8 * _GB)
        self.assertEqual(report["quota_bytes"], 20 * _GB)
        self.assertEqual(report["free_bytes"], 12 * _GB)
        self.assertFalse(report["low"])

    @override_settings(S3_QUOTA_GB=0)
    def test_s3_app_without_quota_has_no_free_and_never_low(self):
        company = Company.load()
        company.storage_mode = Company.StorageMode.S3
        company.save(update_fields=["storage_mode"])
        StoredFile.objects.create(backend="s3", path="a", size=8 * _GB)
        report = space_mod.app_storage_space()
        self.assertIsNone(report["quota_bytes"])
        self.assertIsNone(report["free_bytes"])
        self.assertFalse(report["low"])

    @override_settings(S3_QUOTA_GB=20)
    def test_s3_app_low_when_free_below_threshold(self):
        company = Company.load()
        company.storage_mode = Company.StorageMode.S3
        company.save(update_fields=["storage_mode"])
        StoredFile.objects.create(backend="s3", path="a", size=20 * _GB - 100 * _MB)
        report = space_mod.app_storage_space()
        self.assertEqual(report["free_bytes"], 100 * _MB)
        self.assertTrue(report["low"])

    def test_backup_s3_none_when_not_configured(self):
        with mock.patch("backup.destinations.secondary_s3_configured", return_value=False):
            self.assertIsNone(space_mod.backup_s3_space())

    @override_settings(BACKUP_S3_QUOTA_GB=10)
    def test_backup_s3_used_summed_from_listing(self):
        objects = [{"size": 3 * _GB}, {"size": 1 * _GB}]
        with mock.patch("backup.destinations.secondary_s3_configured", return_value=True), \
             mock.patch("backup.destinations.list_secondary_s3_backups", return_value=objects):
            report = space_mod.backup_s3_space()
        self.assertEqual(report["used_bytes"], 4 * _GB)
        self.assertEqual(report["free_bytes"], 6 * _GB)
        self.assertFalse(report["low"])

    def test_report_low_true_if_any_storage_low(self):
        Company.load()
        usage = mock.Mock(total=50 * _GB, free=100 * _MB, used=0)
        with mock.patch("storage.space.shutil.disk_usage", return_value=usage), \
             mock.patch("backup.destinations.secondary_s3_configured", return_value=False):
            report = space_mod.storage_space_report()
        self.assertTrue(report["low"])
        self.assertIsNone(report["backup_s3"])
        self.assertEqual(report["threshold_bytes"], 500 * _MB)


class StorageSpaceEndpointTests(APITestCase):
    """Эндпоинт /api/company/storage-space/ — только администратор."""

    def setUp(self):
        space_mod._s3_used_cache.clear()

    def test_requires_admin(self):
        user = User.objects.create_user(email="viewer@test.local", password="x")
        self.client.force_authenticate(user)
        resp = self.client.get("/api/company/storage-space/")
        self.assertEqual(resp.status_code, 403)

    def test_admin_gets_report(self):
        admin = User.objects.create_user(email="admin@test.local", password="x", role="admin")
        self.client.force_authenticate(admin)
        usage = mock.Mock(total=50 * _GB, free=10 * _GB, used=0)
        with mock.patch("storage.space.shutil.disk_usage", return_value=usage), \
             mock.patch("backup.destinations.secondary_s3_configured", return_value=False):
            resp = self.client.get("/api/company/storage-space/")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertIn("app", resp.data)
        self.assertEqual(resp.data["app"]["kind"], "local")
        self.assertIsNone(resp.data["backup_s3"])


class InlineFileViewTests(APITestCase):
    """Same-origin прокси файла для PDF-просмотрщика (обход CORS S3-ссылок).
    B39/F1: доступ к файлу проверяется по объекту-владельцу — админ видит любой
    бизнес-файл, обычный сотрудник — только связанные с ним объекты."""

    def setUp(self):
        self.admin = User.objects.create_user(email="inline-admin@e.com", password="Str0ng!Pass1", role="admin")
        self.plain = User.objects.create_user(email="inline-plain@e.com", password="Str0ng!Pass1")
        self.maintenance = User.objects.create_user(email="inline-maint@e.com", password="Str0ng!Pass1", role="maintenance")
        self.automechanic = User.objects.create_user(email="inline-auto@e.com", password="Str0ng!Pass1", role="automechanic")

    def _store(self, name, content, ct):
        return store_uploaded_file(SimpleUploadedFile(name, content, content_type=ct), "test-inline")

    def test_streams_pdf_same_origin(self):
        sf = self._store("plan.pdf", b"%PDF-1.4 test-bytes", "application/pdf")
        self.client.force_authenticate(self.admin)
        resp = self.client.get(f"/api/files/{sf.id}/inline/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp["Content-Type"], "application/pdf")
        self.assertEqual(resp["X-Content-Type-Options"], "nosniff")
        self.assertNotIn("Content-Security-Policy", resp)  # у PDF sandbox нет
        self.assertEqual(b"".join(resp.streaming_content), b"%PDF-1.4 test-bytes")

    def test_non_pdf_gets_sandbox(self):
        sf = self._store("x.html", b"<b>hi</b>", "text/html")
        self.client.force_authenticate(self.admin)
        resp = self.client.get(f"/api/files/{sf.id}/inline/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp["Content-Security-Policy"], "sandbox")

    def test_requires_auth(self):
        sf = self._store("plan.pdf", b"%PDF", "application/pdf")
        resp = self.client.get(f"/api/files/{sf.id}/inline/")
        self.assertIn(resp.status_code, (401, 403))

    def test_missing_file_404(self):
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.get("/api/files/999999/inline/").status_code, 404)

    # --- B39/F1: объектная авторизация инлайн-выдачи ---

    def test_idor_unrelated_file_denied_for_plain_user(self):
        """Файл, не связанный ни с одним доступным объектом, обычному
        пользователю не отдаётся — перебор последовательных id закрыт."""
        sf = self._store("secret.pdf", b"%PDF secret", "application/pdf")
        self.client.force_authenticate(self.plain)
        self.assertEqual(self.client.get(f"/api/files/{sf.id}/inline/").status_code, 404)

    def test_employee_can_access_own_avatar(self):
        from employees.models import Employee
        sf = self._store("me.png", b"img-bytes", "image/png")
        emp = Employee.objects.create(first_name="Иван", last_name="Иванов", avatar=sf)
        self.plain.employee = emp
        self.plain.save(update_fields=["employee"])
        self.client.force_authenticate(self.plain)
        self.assertEqual(self.client.get(f"/api/files/{sf.id}/inline/").status_code, 200)

    def test_employee_cannot_access_other_avatar(self):
        from employees.models import Employee
        sf = self._store("other.png", b"img-bytes", "image/png")
        Employee.objects.create(first_name="Пётр", last_name="Петров", avatar=sf)
        self.client.force_authenticate(self.plain)
        self.assertEqual(self.client.get(f"/api/files/{sf.id}/inline/").status_code, 404)

    def test_backup_binary_denied_even_for_admin(self):
        """Бинарники бэкапов инлайн не отдаются никому (скачиваются отдельным
        авторизованным эндпоинтом)."""
        sf = StoredFile.objects.create(
            backend="local", path="backups/dump.bin", content_type="application/octet-stream"
        )
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.get(f"/api/files/{sf.id}/inline/").status_code, 404)

    def _parking_plan(self, name):
        """Комната-парковка с планом (plan_file) — возвращает (place, stored_file)."""
        from locations.models import Building, Place, Room
        sf = self._store(name, b"img-bytes", "image/png")
        building = Building.objects.create(name="БЦ Звездный")
        room = Room.objects.create(building=building, name="Паркинг", plan_file=sf)
        spot = Place.objects.create(room=room, name="Место", place_type=Place.PlaceType.PARKING_SPOT)
        return spot, sf

    def test_employee_can_access_own_parking_plan(self):
        """Сотрудник, закреплённый за парковочным местом, открывает план своей
        парковки (показывается в его Профиле)."""
        from employees.models import Employee
        spot, sf = self._parking_plan("parking-own.png")
        emp = Employee.objects.create(first_name="Иван", last_name="Иванов")
        spot.employees.add(emp)
        self.plain.employee = emp
        self.plain.save(update_fields=["employee"])
        self.client.force_authenticate(self.plain)
        self.assertEqual(self.client.get(f"/api/files/{sf.id}/inline/").status_code, 200)

    def test_employee_cannot_access_foreign_parking_plan(self):
        """План чужой парковки (сотрудник за ней не закреплён) — недоступен."""
        from employees.models import Employee
        spot, sf = self._parking_plan("parking-foreign.png")
        spot.employees.add(Employee.objects.create(first_name="Пётр", last_name="Петров"))
        self.plain.employee = Employee.objects.create(first_name="Иван", last_name="Иванов")
        self.plain.save(update_fields=["employee"])
        self.client.force_authenticate(self.plain)
        self.assertEqual(self.client.get(f"/api/files/{sf.id}/inline/").status_code, 404)

    def _equipment_file(self, name):
        """Файл-реквизит оборудования — возвращает stored_file."""
        from equipment.models import Equipment, EquipmentFieldValue, EquipmentType, EquipmentTypeField
        sf = self._store(name, b"img-bytes", "image/png")
        etype = EquipmentType.objects.create(name="ПК")
        field = EquipmentTypeField.objects.create(equipment_type=etype, name="Скан", value_type="file")
        eq = Equipment.objects.create(inventory_number=f"EQ-{name}", equipment_type=etype)
        EquipmentFieldValue.objects.create(equipment=eq, field=field, value_file=sf)
        return sf

    def _transport_file(self, name):
        """Файл-реквизит транспорта — возвращает stored_file."""
        from transport.models import Transport, TransportFieldValue, TransportType, TransportTypeField
        sf = self._store(name, b"img-bytes", "image/png")
        ttype = TransportType.objects.create(name="Легковой")
        field = TransportTypeField.objects.create(transport_type=ttype, name="Скан", value_type="file")
        tr = Transport.objects.create(inventory_number=f"TS-{name}", transport_type=ttype)
        TransportFieldValue.objects.create(transport=tr, field=field, value_file=sf)
        return sf

    def test_maintenance_can_access_equipment_file(self):
        """«Механик по оборудованию» читает раздел Оборудование → открывает
        файлы-реквизиты его карточек."""
        sf = self._equipment_file("eqm")
        self.client.force_authenticate(self.maintenance)
        self.assertEqual(self.client.get(f"/api/files/{sf.id}/inline/").status_code, 200)

    def test_maintenance_cannot_access_transport_file(self):
        """…но раздел Транспорт ему недоступен — его файлы тоже."""
        sf = self._transport_file("trm")
        self.client.force_authenticate(self.maintenance)
        self.assertEqual(self.client.get(f"/api/files/{sf.id}/inline/").status_code, 404)

    def test_automechanic_can_access_transport_file(self):
        """«Автомеханик» читает раздел Транспорт → открывает файлы-реквизиты его
        карточек."""
        sf = self._transport_file("tra")
        self.client.force_authenticate(self.automechanic)
        self.assertEqual(self.client.get(f"/api/files/{sf.id}/inline/").status_code, 200)

    def test_automechanic_cannot_access_equipment_file(self):
        """…но раздел Оборудование ему недоступен — его файлы тоже."""
        sf = self._equipment_file("eqa")
        self.client.force_authenticate(self.automechanic)
        self.assertEqual(self.client.get(f"/api/files/{sf.id}/inline/").status_code, 404)
