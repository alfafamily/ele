from unittest.mock import patch

from django.core import mail
from django.test import override_settings
from rest_framework.test import APITestCase

from accounts.models import User

from .models import Company


class CompanyBriefTests(APITestCase):
    """Название/лого для навигации (§8.5) — видно любой аутентифицированной
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
    """Настройки → Компания (§5.5.1) — только Администратор; storage_mode
    сюда не входит (отдельный эндпоинт со своей валидацией §8.3)."""

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
                "kpp": "770101001",
                "domain": "romashka.ru",
                "ip_allowlist": ["195.19.0.0/16"],
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        company = Company.load()
        self.assertEqual(company.name, "ООО «Ромашка»")
        self.assertEqual(company.domain, "romashka.ru")
        self.assertEqual(company.ip_allowlist, ["195.19.0.0/16"])

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
    единой проверки (§4.1: ничего настроено — мастер не блокирует)."""

    def test_complete_setup_without_any_integration(self):
        payload = {
            "admin": {"email": "admin@alpha.family", "password": "Str0ng!Pass1", "password_repeat": "Str0ng!Pass1"},
            "company": {"name": "Alpha Family", "inn": "123", "kpp": "456"},
        }
        resp = self.client.post("/api/setup/complete/", payload, format="json")
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertTrue(User.objects.filter(email="admin@alpha.family", role=User.Role.ADMIN).exists())
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
            "admin": {"email": "admin@alpha.family", "password": "Str0ng!Pass1", "password_repeat": "Str0ng!Pass1"},
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
            "admin": {"email": "admin@alpha.family", "password": "Str0ng!Pass1", "password_repeat": "Str0ng!Pass1"},
            "company": {"name": "Alpha Family"},
        }
        resp = self.client.post("/api/setup/complete/", payload, format="json")
        self.assertEqual(resp.status_code, 400)

    @patch("company.views.test_s3_connection", return_value=(True, None))
    def test_successful_test_unblocks_complete(self, mock_test):
        resp = self.client.post("/api/setup/test-storage-connection/")
        self.assertEqual(resp.status_code, 200)

        payload = {
            "admin": {"email": "admin@alpha.family", "password": "Str0ng!Pass1", "password_repeat": "Str0ng!Pass1"},
            "company": {"name": "Alpha Family"},
        }
        resp = self.client.post("/api/setup/complete/", payload, format="json")
        self.assertEqual(resp.status_code, 201, resp.data)


@override_settings(EMAIL_CONFIGURED=True, EMAIL_HOST="smtp.internal")
class SetupWizardEmailVerificationTests(APITestCase):
    def test_complete_blocked_without_email_verification(self):
        payload = {
            "admin": {"email": "admin@alpha.family", "password": "Str0ng!Pass1", "password_repeat": "Str0ng!Pass1"},
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
            "admin": {"email": "admin@alpha.family", "password": "Str0ng!Pass1", "password_repeat": "Str0ng!Pass1"},
            "company": {"name": "Alpha Family"},
        }
        resp = self.client.post("/api/setup/complete/", payload, format="json")
        self.assertEqual(resp.status_code, 201, resp.data)

    def test_verified_email_must_match_admin_email(self):
        resp = self.client.post("/api/setup/test-email/", {"email": "someone-else@alpha.family"}, format="json")
        code = mail.outbox[0].subject.split(": ")[-1]
        self.client.post("/api/setup/verify-email/", {"code": code}, format="json")

        payload = {
            "admin": {"email": "admin@alpha.family", "password": "Str0ng!Pass1", "password_repeat": "Str0ng!Pass1"},
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
            "admin": {"email": "admin@alpha.family", "password": "Str0ng!Pass1", "password_repeat": "Str0ng!Pass1"},
            "company": {"name": "Alpha Family"},
        }
        resp = self.client.post("/api/setup/complete/", payload, format="json")
        self.assertEqual(resp.status_code, 400)

    @patch("company.views.check_smartcaptcha_reachable", return_value=True)
    def test_reachable_captcha_unblocks_complete(self, mock_check):
        resp = self.client.post("/api/setup/test-captcha/")
        self.assertEqual(resp.status_code, 200)
        payload = {
            "admin": {"email": "admin@alpha.family", "password": "Str0ng!Pass1", "password_repeat": "Str0ng!Pass1"},
            "company": {"name": "Alpha Family"},
        }
        resp = self.client.post("/api/setup/complete/", payload, format="json")
        self.assertEqual(resp.status_code, 201, resp.data)
