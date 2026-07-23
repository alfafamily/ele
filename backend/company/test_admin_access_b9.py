"""B9: контролируемый доступ в служебную Django-админку."""
from types import SimpleNamespace

from django.contrib.admin.sites import site as admin_site
from rest_framework.test import APITestCase

from accounts.models import User
from employees.models import Employee

from .models import Company


def _req(user):
    return SimpleNamespace(user=user)


class AdminGateMiddlewareTests(APITestCase):
    """Гейт /django_admin: 404, пока не включён флаг И IP не в admin-allowlist."""

    def setUp(self):
        self.company = Company.load()

    def test_404_when_disabled(self):
        self.company.admin_access_enabled = False
        self.company.admin_access_ips = [{"ip": "127.0.0.1", "note": ""}]
        self.company.save()
        resp = self.client.get("/django_admin/")
        self.assertEqual(resp.status_code, 404)

    def test_404_when_ip_not_allowed(self):
        self.company.admin_access_enabled = True
        self.company.admin_access_ips = [{"ip": "203.0.113.7", "note": ""}]
        self.company.save()
        resp = self.client.get("/django_admin/", REMOTE_ADDR="127.0.0.1")
        self.assertEqual(resp.status_code, 404)

    def test_404_when_enabled_but_no_ips(self):
        # Пустой admin-allowlist трактуем как «закрыто» (в отличие от allowlist входа).
        self.company.admin_access_enabled = True
        self.company.admin_access_ips = []
        self.company.save()
        resp = self.client.get("/django_admin/", REMOTE_ADDR="127.0.0.1")
        self.assertEqual(resp.status_code, 404)

    def test_passes_gate_when_enabled_and_ip_allowed(self):
        self.company.admin_access_enabled = True
        self.company.admin_access_ips = [{"ip": "127.0.0.1", "note": "test"}]
        self.company.save()
        # Проходит гейт → Django-админка редиректит анонима на форму входа (302),
        # но НЕ 404.
        resp = self.client.get("/django_admin/", REMOTE_ADDR="127.0.0.1")
        self.assertNotEqual(resp.status_code, 404)
        self.assertIn(resp.status_code, (200, 302))

    def test_404_without_trailing_slash_when_disabled(self):
        # Путь без завершающего слэша тоже под гейтом (иначе в проде уходит в SPA).
        self.company.admin_access_enabled = False
        self.company.admin_access_ips = [{"ip": "127.0.0.1", "note": ""}]
        self.company.save()
        resp = self.client.get("/django_admin", REMOTE_ADDR="127.0.0.1")
        self.assertEqual(resp.status_code, 404)

    def test_no_slash_passes_gate_and_redirects_when_open(self):
        self.company.admin_access_enabled = True
        self.company.admin_access_ips = [{"ip": "127.0.0.1", "note": ""}]
        self.company.save()
        # Гейт пропускает → Django добавляет слеш (301 на /django_admin/).
        resp = self.client.get("/django_admin", REMOTE_ADDR="127.0.0.1")
        self.assertNotEqual(resp.status_code, 404)
        self.assertIn(resp.status_code, (301, 302))


class AdminAccessSettingsTests(APITestCase):
    """Сериализатор настроек: валидация и каскад снятия is_superuser."""

    def setUp(self):
        self.admin = User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=self.admin)

    def test_cannot_enable_without_ips(self):
        resp = self.client.patch(
            "/api/company/settings/", {"admin_access_enabled": True, "admin_access_ips": []}, format="json"
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("admin_access_ips", resp.data.get("errors", resp.data))

    def test_enable_with_ip_ok(self):
        resp = self.client.patch(
            "/api/company/settings/",
            {"admin_access_enabled": True, "admin_access_ips": [{"ip": "127.0.0.1", "note": "office"}]},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data["admin_access_enabled"])

    def test_invalid_ip_rejected(self):
        resp = self.client.patch(
            "/api/company/settings/", {"admin_access_ips": [{"ip": "not-an-ip", "note": ""}]}, format="json"
        )
        self.assertEqual(resp.status_code, 400)

    def test_disable_strips_superuser_from_everyone(self):
        # Включаем доступ и выдаём второму админу право правки (is_superuser).
        editor = User.objects.create_user(
            email="editor@example.com", password="Str0ng!Pass1", role=User.Role.ADMIN, is_email_confirmed=True
        )
        company = Company.load()
        company.admin_access_enabled = True
        company.admin_access_ips = [{"ip": "127.0.0.1", "note": ""}]
        company.save()
        editor.is_superuser = True
        editor.save()
        self.assertTrue(User.objects.get(pk=editor.pk).is_superuser)

        resp = self.client.patch("/api/company/settings/", {"admin_access_enabled": False}, format="json")
        self.assertEqual(resp.status_code, 200)
        # У всех сняты права редактирования.
        self.assertFalse(User.objects.get(pk=editor.pk).is_superuser)
        self.assertFalse(User.objects.get(pk=self.admin.pk).is_superuser)


class AdminEditFlagUserTests(APITestCase):
    """Галка «разрешать редактировать» (= is_superuser) в карточке пользователя."""

    def setUp(self):
        self.admin = User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=self.admin)
        self.target = User.objects.create_user(
            email="second@example.com", password="Str0ng!Pass1", role=User.Role.ADMIN, is_email_confirmed=True
        )

    def _patch(self, payload):
        return self.client.patch(f"/api/users/{self.target.pk}/", payload, format="json")

    def test_cannot_grant_when_access_disabled(self):
        resp = self._patch({"role": "admin", "admin_edit_enabled": True})
        self.assertEqual(resp.status_code, 400)
        self.assertFalse(User.objects.get(pk=self.target.pk).is_superuser)

    def test_grant_when_access_enabled(self):
        company = Company.load()
        company.admin_access_enabled = True
        company.admin_access_ips = [{"ip": "127.0.0.1", "note": ""}]
        company.save()
        resp = self._patch({"role": "admin", "admin_edit_enabled": True})
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(User.objects.get(pk=self.target.pk).is_superuser)

    def test_non_admin_role_cannot_be_superuser(self):
        company = Company.load()
        company.admin_access_enabled = True
        company.admin_access_ips = [{"ip": "127.0.0.1", "note": ""}]
        company.save()
        emp = Employee.objects.create(last_name="И", first_name="И")
        resp = self._patch({"role": "employee", "admin_edit_enabled": True, "employee": emp.pk})
        # Роль не admin → is_superuser принудительно снят (не ошибка).
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(User.objects.get(pk=self.target.pk).is_superuser)


class ReadonlyAdminMixinTests(APITestCase):
    """Политика прав ModelAdmin: просмотр — админу, правка — только superuser."""

    def test_permissions(self):
        from employees.admin import EmployeeAdmin

        model_admin = admin_site._registry[Employee]
        self.assertIsInstance(model_admin, EmployeeAdmin)

        readonly_admin = User.objects.create_user(
            email="ro@example.com", password="Str0ng!Pass1", role=User.Role.ADMIN, is_email_confirmed=True
        )
        superuser = User.objects.create_superuser(email="su@example.com", password="Str0ng!Pass1")
        worker = User.objects.create_user(email="w@example.com", password="Str0ng!Pass1")

        # Админ без superuser — видит, но не правит.
        self.assertTrue(model_admin.has_view_permission(_req(readonly_admin)))
        self.assertTrue(model_admin.has_module_permission(_req(readonly_admin)))
        self.assertFalse(model_admin.has_add_permission(_req(readonly_admin)))
        self.assertFalse(model_admin.has_change_permission(_req(readonly_admin)))
        self.assertFalse(model_admin.has_delete_permission(_req(readonly_admin)))

        # Superuser — полный доступ.
        self.assertTrue(model_admin.has_change_permission(_req(superuser)))
        self.assertTrue(model_admin.has_delete_permission(_req(superuser)))

        # Не-админ — вообще нет доступа к разделу.
        self.assertFalse(model_admin.has_view_permission(_req(worker)))
        self.assertFalse(model_admin.has_module_permission(_req(worker)))
