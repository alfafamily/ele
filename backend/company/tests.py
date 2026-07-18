from unittest.mock import patch

from django.core import mail
from django.test import override_settings
from rest_framework.test import APITestCase

from accounts.models import User

from .models import Company


class CompanyBriefTests(APITestCase):
    """Название/лого для навигации — видно любой аутентифицированной
    роли, не только Администратору (в отличие от Настройки → Компания)."""

    def test_requires_authentication(self):
        resp = self.client.get("/api/company/")
        self.assertEqual(resp.status_code, 403)

    def test_returns_name_for_any_role(self):
        company = Company.load()
        company.name = "ООО «Ромашка»"
        company.save()
        worker = User.objects.create_user(email="worker@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=worker)
        resp = self.client.get("/api/company/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["name"], "ООО «Ромашка»")
        self.assertIsNone(resp.data["logo"])


class CompanySettingsTests(APITestCase):
    """Настройки → Компания — только Администратор; storage_mode
    сюда не входит (отдельный эндпоинт со своей валидацией)."""

    def setUp(self):
        self.admin = User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")

    def test_forbidden_for_non_admin(self):
        worker = User.objects.create_user(email="worker@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=worker)
        resp = self.client.get("/api/company/settings/")
        self.assertEqual(resp.status_code, 403)

    def test_admin_updates_company_profile(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.patch(
            "/api/company/settings/",
            {
                "name": "ООО «Ромашка»",
                "inn": "7701234567",
                "domain": "romashka.ru",
                "ip_allowlist": [{"ip": "195.19.0.0/16", "note": "Офис"}],
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        company = Company.load()
        self.assertEqual(company.name, "ООО «Ромашка»")
        self.assertEqual(company.domain, "romashka.ru")
        self.assertEqual(company.ip_allowlist, [{"ip": "195.19.0.0/16", "note": "Офис"}])

    def test_ip_allowlist_rejects_invalid_ip(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.patch(
            "/api/company/settings/",
            {"ip_allowlist": [{"ip": "не-айпи", "note": ""}]},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_storage_mode_not_writable_here(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.patch("/api/company/settings/", {"storage_mode": "s3"}, format="json")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(Company.load().storage_mode, Company.StorageMode.LOCAL)


class StorageModeReadTests(APITestCase):
    def test_get_returns_current_mode(self):
        admin = User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=admin)
        resp = self.client.get("/api/company/storage-mode/")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data["storage_mode"], "local")


class EnvironmentStatusTests(APITestCase):
    def test_nothing_configured_by_default(self):
        resp = self.client.get("/api/setup/environment/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["storage"]["mode"], "local")
        self.assertTrue(resp.data["storage"]["configured"])  # local всегда "настроено"
        self.assertFalse(resp.data["captcha"]["configured"])
        self.assertFalse(resp.data["yandex_id"]["configured"])

    def test_blocked_once_admin_exists(self):
        User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")
        resp = self.client.get("/api/setup/environment/")
        self.assertEqual(resp.status_code, 403)


@override_settings(EMAIL_CONFIGURED=False)
class SetupWizardLocalOnlyTests(APITestCase):
    """local-хранилище + пустые email/captcha/yandex — минимальный путь без
    единой проверки (ничего настроено — мастер не блокирует)."""

    def test_complete_setup_without_any_integration(self):
        payload = {
            "admin": {"last_name": "Иванов", "first_name": "Пётр", "email": "admin@alpha.family", "password": "Str0ng!Pass1", "password_repeat": "Str0ng!Pass1"},
            "company": {"name": "Alpha Family", "inn": "123"},
        }
        resp = self.client.post("/api/setup/complete/", payload, format="json")
        self.assertEqual(resp.status_code, 201, resp.data)
        admin = User.objects.get(email="admin@alpha.family", role=User.Role.ADMIN)
        # Администратору заводится связанный Сотрудник из Фамилии/Имени.
        self.assertIsNotNone(admin.employee)
        self.assertEqual(admin.employee.last_name, "Иванов")
        self.assertEqual(admin.employee.first_name, "Пётр")
        self.assertEqual(Company.load().name, "Alpha Family")
        self.assertEqual(Company.load().storage_mode, "local")

    def test_complete_setup_blocked_once_admin_exists(self):
        User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")
        payload = {
            "admin": {"email": "another@alpha.family", "password": "Str0ng!Pass1", "password_repeat": "Str0ng!Pass1"},
            "company": {"name": "X"},
        }
        resp = self.client.post("/api/setup/complete/", payload, format="json")
        self.assertEqual(resp.status_code, 403)


@override_settings(ELE_STORAGE_MODE="s3", S3_ENDPOINT="", S3_BUCKET="", S3_REGION="", S3_ACCESS_KEY="", S3_SECRET_KEY="")
class SetupWizardS3IncompleteEnvTests(APITestCase):
    def test_s3_mode_without_env_vars_reports_not_configured(self):
        resp = self.client.get("/api/setup/environment/")
        self.assertFalse(resp.data["storage"]["configured"])

    def test_complete_blocked_without_storage_verification(self):
        payload = {
            "admin": {"last_name": "Иванов", "first_name": "Пётр", "email": "admin@alpha.family", "password": "Str0ng!Pass1", "password_repeat": "Str0ng!Pass1"},
            "company": {"name": "Alpha Family"},
        }
        resp = self.client.post("/api/setup/complete/", payload, format="json")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("errors", resp.data)
        self.assertFalse(User.objects.filter(role=User.Role.ADMIN).exists())


@override_settings(
    ELE_STORAGE_MODE="s3",
    S3_ENDPOINT="https://s3.invalid.example",
    S3_BUCKET="ele-files",
    S3_REGION="ru-central1",
    S3_ACCESS_KEY="AKIA",
    S3_SECRET_KEY="secret",
    EMAIL_CONFIGURED=False,
)
class SetupWizardS3ConnectionTests(APITestCase):
    def test_unreachable_s3_test_fails_and_blocks_complete(self):
        resp = self.client.post("/api/setup/test-storage-connection/")
        self.assertEqual(resp.status_code, 400)

        payload = {
            "admin": {"last_name": "Иванов", "first_name": "Пётр", "email": "admin@alpha.family", "password": "Str0ng!Pass1", "password_repeat": "Str0ng!Pass1"},
            "company": {"name": "Alpha Family"},
        }
        resp = self.client.post("/api/setup/complete/", payload, format="json")
        self.assertEqual(resp.status_code, 400)

    @patch("company.views.test_s3_connection", return_value=(True, None))
    def test_successful_test_unblocks_complete(self, mock_test):
        resp = self.client.post("/api/setup/test-storage-connection/")
        self.assertEqual(resp.status_code, 200)

        payload = {
            "admin": {"last_name": "Иванов", "first_name": "Пётр", "email": "admin@alpha.family", "password": "Str0ng!Pass1", "password_repeat": "Str0ng!Pass1"},
            "company": {"name": "Alpha Family"},
        }
        resp = self.client.post("/api/setup/complete/", payload, format="json")
        self.assertEqual(resp.status_code, 201, resp.data)


@override_settings(EMAIL_CONFIGURED=True, EMAIL_HOST="smtp.internal")
class SetupWizardEmailVerificationTests(APITestCase):
    def test_complete_blocked_without_email_verification(self):
        payload = {
            "admin": {"last_name": "Иванов", "first_name": "Пётр", "email": "admin@alpha.family", "password": "Str0ng!Pass1", "password_repeat": "Str0ng!Pass1"},
            "company": {"name": "Alpha Family"},
        }
        resp = self.client.post("/api/setup/complete/", payload, format="json")
        self.assertEqual(resp.status_code, 400)

    def test_full_email_code_flow_unblocks_complete(self):
        resp = self.client.post("/api/setup/test-email/", {"email": "admin@alpha.family"}, format="json")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(len(mail.outbox), 1)
        code = mail.outbox[0].subject.split(": ")[-1]
        self.assertEqual(len(code), 6)

        resp = self.client.post("/api/setup/verify-email/", {"code": "000000"}, format="json")
        self.assertEqual(resp.status_code, 400)  # заведомо неверный код

        resp = self.client.post("/api/setup/verify-email/", {"code": code}, format="json")
        self.assertEqual(resp.status_code, 200, resp.data)

        payload = {
            "admin": {"last_name": "Иванов", "first_name": "Пётр", "email": "admin@alpha.family", "password": "Str0ng!Pass1", "password_repeat": "Str0ng!Pass1"},
            "company": {"name": "Alpha Family"},
        }
        resp = self.client.post("/api/setup/complete/", payload, format="json")
        self.assertEqual(resp.status_code, 201, resp.data)

    def test_verified_email_must_match_admin_email(self):
        resp = self.client.post("/api/setup/test-email/", {"email": "someone-else@alpha.family"}, format="json")
        code = mail.outbox[0].subject.split(": ")[-1]
        self.client.post("/api/setup/verify-email/", {"code": code}, format="json")

        payload = {
            "admin": {"last_name": "Иванов", "first_name": "Пётр", "email": "admin@alpha.family", "password": "Str0ng!Pass1", "password_repeat": "Str0ng!Pass1"},
            "company": {"name": "Alpha Family"},
        }
        resp = self.client.post("/api/setup/complete/", payload, format="json")
        self.assertEqual(resp.status_code, 400)


@override_settings(YANDEX_SMARTCAPTCHA_SITE_KEY="site", YANDEX_SMARTCAPTCHA_SECRET_KEY="secret", EMAIL_CONFIGURED=False)
class SetupWizardCaptchaCheckTests(APITestCase):
    @patch("company.views.check_smartcaptcha_reachable", return_value=False)
    def test_unreachable_captcha_blocks_complete(self, mock_check):
        resp = self.client.post("/api/setup/test-captcha/")
        self.assertEqual(resp.status_code, 400)
        payload = {
            "admin": {"last_name": "Иванов", "first_name": "Пётр", "email": "admin@alpha.family", "password": "Str0ng!Pass1", "password_repeat": "Str0ng!Pass1"},
            "company": {"name": "Alpha Family"},
        }
        resp = self.client.post("/api/setup/complete/", payload, format="json")
        self.assertEqual(resp.status_code, 400)

    @patch("company.views.check_smartcaptcha_reachable", return_value=True)
    def test_reachable_captcha_unblocks_complete(self, mock_check):
        resp = self.client.post("/api/setup/test-captcha/")
        self.assertEqual(resp.status_code, 200)
        payload = {
            "admin": {"last_name": "Иванов", "first_name": "Пётр", "email": "admin@alpha.family", "password": "Str0ng!Pass1", "password_repeat": "Str0ng!Pass1"},
            "company": {"name": "Alpha Family"},
        }
        resp = self.client.post("/api/setup/complete/", payload, format="json")
        self.assertEqual(resp.status_code, 201, resp.data)


@override_settings(EMAIL_CONFIGURED=True, EMAIL_HOST="smtp.internal")
class CompanySmtpCheckTests(APITestCase):
    """Настройки → Компания → «Проверить SMTP»: код уходит на почту самого
    администратора, подтверждение кода доказывает доставку. Только Администратор."""

    def setUp(self):
        self.admin = User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")

    def test_requires_admin(self):
        worker = User.objects.create_user(email="worker@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=worker)
        self.assertEqual(self.client.post("/api/company/test-email/").status_code, 403)

    def test_sends_code_to_current_admin_and_verifies(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post("/api/company/test-email/")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data["email"], self.admin.email)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, [self.admin.email])

        code = mail.outbox[0].subject.split(": ")[-1]
        self.assertEqual(self.client.post("/api/company/verify-email/", {"code": "000000"}, format="json").status_code, 400)
        resp = self.client.post("/api/company/verify-email/", {"code": code}, format="json")
        self.assertEqual(resp.status_code, 200, resp.data)

    def test_blocked_when_smtp_not_configured(self):
        self.client.force_authenticate(user=self.admin)
        with override_settings(EMAIL_CONFIGURED=False):
            resp = self.client.post("/api/company/test-email/")
        self.assertEqual(resp.status_code, 400)


class SystemSettingsPageTests(APITestCase):
    """Настройки → Системные: статус конфигурации и точечные проверки."""

    def setUp(self):
        self.admin = User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")

    def test_system_status_requires_admin(self):
        worker = User.objects.create_user(email="worker@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=worker)
        self.assertEqual(self.client.get("/api/company/system-status/").status_code, 403)

    def test_system_status_reports_flags(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get("/api/company/system-status/")
        self.assertEqual(resp.status_code, 200, resp.data)
        for key in ("storage_mode", "s3_configured", "email_configured", "yandex_id_configured", "captcha_configured"):
            self.assertIn(key, resp.data)

    def test_storage_test_local_ok(self):
        import tempfile

        self.client.force_authenticate(user=self.admin)
        with tempfile.TemporaryDirectory() as tmp, override_settings(MEDIA_ROOT=tmp):
            resp = self.client.post("/api/company/storage-test/")
        self.assertEqual(resp.status_code, 200, resp.data)

    def test_yandex_id_check_blocked_when_not_configured(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post("/api/company/yandex-id-check/")
        self.assertEqual(resp.status_code, 400)

    def test_captcha_check_blocked_when_not_configured(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post("/api/company/captcha-check/", {"token": "x"}, format="json")
        self.assertEqual(resp.status_code, 400)

    @override_settings(YANDEX_SMARTCAPTCHA_SITE_KEY="site", YANDEX_SMARTCAPTCHA_SECRET_KEY="secret")
    def test_captcha_check_requires_token(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post("/api/company/captcha-check/", {}, format="json")
        self.assertEqual(resp.status_code, 400)


class StorageModeSwitchGuardTests(APITestCase):
    """Пока идёт перенос файлов, менять режим хранилища нельзя (иначе
    новый перенос пересечётся с текущим и рискует сохранностью файлов)."""

    def setUp(self):
        self.admin = User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=self.admin)

    def test_switch_blocked_while_migrating(self):
        from storage.models import StoredFile

        # текущий target — local; файл на s3 без ошибки = идёт перенос
        StoredFile.objects.create(backend="s3", path="a/x.txt")
        resp = self.client.patch("/api/company/storage-mode/", {"storage_mode": "s3"}, format="json")
        self.assertEqual(resp.status_code, 409, resp.data)
        self.assertEqual(Company.load().storage_mode, "local")

    @override_settings(S3_ENDPOINT="https://s3", S3_BUCKET="b", S3_REGION="r", S3_ACCESS_KEY="k", S3_SECRET_KEY="s")
    def test_errored_files_do_not_block(self):
        from storage.models import StoredFile

        StoredFile.objects.create(backend="s3", path="a/x.txt", migration_status=StoredFile.MigrationStatus.ERROR)
        resp = self.client.patch("/api/company/storage-mode/", {"storage_mode": "s3"}, format="json")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(Company.load().storage_mode, "s3")


class UpdateInfoTests(APITestCase):
    """Настройки → Обновление: текущая версия + проверка последней в репозитории.
    Сетевой запрос к GitHub замокан — проверяем только логику сравнения/гейт."""

    def setUp(self):
        self.admin = User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")

    def test_requires_admin(self):
        resp = self.client.get("/api/company/update-info/")
        self.assertEqual(resp.status_code, 403)

    @patch("company.views.get_current_version", return_value="1.0.30")
    @patch("company.views.get_latest_release", return_value={"version": "1.0.31", "url": "https://gh/r", "notes": "n"})
    def test_update_available(self, _m_latest, _m_current):
        self.client.force_authenticate(self.admin)
        resp = self.client.get("/api/company/update-info/")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data["current_version"], "1.0.30")
        self.assertEqual(resp.data["latest_version"], "1.0.31")
        self.assertTrue(resp.data["update_available"])
        self.assertTrue(resp.data["check_ok"])
        self.assertEqual(resp.data["release_url"], "https://gh/r")
        self.assertEqual(resp.data["install_dir"], "/opt/ele")  # дефолт без ELE_DIR

    @patch("company.views.get_current_version", return_value="1.0.30")
    @patch("company.views.get_latest_release", return_value={"version": "1.0.30", "url": "https://gh/r", "notes": ""})
    def test_up_to_date(self, _m_latest, _m_current):
        self.client.force_authenticate(self.admin)
        resp = self.client.get("/api/company/update-info/")
        self.assertFalse(resp.data["update_available"])
        self.assertTrue(resp.data["check_ok"])

    @patch("company.views.get_current_version", return_value="1.0.30")
    @patch("company.views.get_latest_release", return_value=None)
    def test_check_offline(self, _m_latest, _m_current):
        self.client.force_authenticate(self.admin)
        resp = self.client.get("/api/company/update-info/")
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(resp.data["check_ok"])
        self.assertFalse(resp.data["update_available"])
        self.assertIsNone(resp.data["latest_version"])


class NumberingSettingsTests(APITestCase):
    """Настройки → Префиксы и автонумератор учётных номеров (B2)."""

    def setUp(self):
        self.admin = User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")

    def test_settings_require_admin(self):
        worker = User.objects.create_user(email="worker@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=worker)
        self.assertEqual(self.client.get("/api/company/numbering-settings/").status_code, 403)

    def test_default_prefixes(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get("/api/company/numbering-settings/")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data["equipment_number_prefix"], "EQUIP")
        self.assertEqual(resp.data["key_number_prefix"], "KEY")
        self.assertEqual(resp.data["pass_number_prefix"], "PASS")

    def test_empty_prefix_rejected(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.patch("/api/company/numbering-settings/", {"key_number_prefix": "  "}, format="json")
        self.assertEqual(resp.status_code, 400)

    def test_next_number_increments_per_kind(self):
        self.client.force_authenticate(user=self.admin)
        self.assertEqual(self.client.post("/api/company/next-number/", {"kind": "key"}, format="json").data["number"], "KEY-1")
        self.assertEqual(self.client.post("/api/company/next-number/", {"kind": "key"}, format="json").data["number"], "KEY-2")
        # Другой вид объектов — независимый счётчик.
        self.assertEqual(self.client.post("/api/company/next-number/", {"kind": "equipment"}, format="json").data["number"], "EQUIP-1")

    def test_prefix_change_does_not_reset_counter(self):
        self.client.force_authenticate(user=self.admin)
        self.client.post("/api/company/next-number/", {"kind": "pass"}, format="json")  # PASS-1 «сгорел»
        self.client.patch("/api/company/numbering-settings/", {"pass_number_prefix": "CARD"}, format="json")
        # Смена префикса не сбрасывает порядковый номер — следующий именно 2.
        self.assertEqual(self.client.post("/api/company/next-number/", {"kind": "pass"}, format="json").data["number"], "CARD-2")

    def test_unknown_kind_rejected(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post("/api/company/next-number/", {"kind": "widget"}, format="json")
        self.assertEqual(resp.status_code, 400)

    def test_duplicate_prefix_across_kinds_rejected(self):
        self.client.force_authenticate(user=self.admin)
        # У ключей по умолчанию KEY — задать пропускам тот же префикс нельзя.
        resp = self.client.patch("/api/company/numbering-settings/", {"pass_number_prefix": "KEY"}, format="json")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("pass_number_prefix", resp.data["errors"])
        # Регистр не спасает — сравнение без учёта регистра.
        resp = self.client.patch("/api/company/numbering-settings/", {"pass_number_prefix": "key"}, format="json")
        self.assertEqual(resp.status_code, 400)
        # Уникальный префикс — принимается.
        resp = self.client.patch("/api/company/numbering-settings/", {"pass_number_prefix": "CARD"}, format="json")
        self.assertEqual(resp.status_code, 200, resp.data)

    def test_next_number_forbidden_for_worker(self):
        worker = User.objects.create_user(email="worker@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=worker)
        resp = self.client.post("/api/company/next-number/", {"kind": "key"}, format="json")
        self.assertEqual(resp.status_code, 403)
