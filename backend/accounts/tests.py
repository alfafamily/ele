from smtplib import SMTPException
from unittest import mock

from django.core import mail
from django.test import override_settings
from rest_framework.test import APITestCase

from company.models import Company

from .models import User
from .tokens import make_set_password_link


class BootstrapTests(APITestCase):
    def test_setup_required_and_integrations_hidden_when_env_empty(self):
        resp = self.client.get("/api/auth/bootstrap/")
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data["setup_required"])
        self.assertFalse(resp.data["yandex_id_enabled"])
        self.assertFalse(resp.data["captcha_enabled"])
        self.assertIsNone(resp.data["captcha_site_key"])

    def test_setup_not_required_after_admin_exists(self):
        User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")
        resp = self.client.get("/api/auth/bootstrap/")
        self.assertFalse(resp.data["setup_required"])


class RegistrationTests(APITestCase):
    def setUp(self):
        self.company = Company.load()
        self.company.domain = "alpha.family"
        self.company.save()

    def test_register_wrong_domain_rejected(self):
        resp = self.client.post(
            "/api/auth/register/",
            {
                "email": "user@other.com",
                "password": "Str0ng!Pass1",
                "password_repeat": "Str0ng!Pass1",
                "last_name": "Петров",
                "first_name": "Пётр",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("errors", resp.data)

    def test_register_blocked_when_registration_closed(self):
        # B14: при выключенной открытой регистрации самостоятельная
        # регистрация запрещена (403), даже с корректными данными.
        self.company.open_registration = False
        self.company.save(update_fields=["open_registration"])
        resp = self.client.post(
            "/api/auth/register/",
            {
                "email": "user@alpha.family",
                "password": "Str0ng!Pass1",
                "password_repeat": "Str0ng!Pass1",
                "last_name": "Петров",
                "first_name": "Пётр",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 403)
        self.assertFalse(User.objects.filter(email="user@alpha.family").exists())

    def test_register_requires_name(self):
        # Фамилия/Имя обязательны — без них не создать Сотрудника.
        resp = self.client.post(
            "/api/auth/register/",
            {"email": "user@alpha.family", "password": "Str0ng!Pass1", "password_repeat": "Str0ng!Pass1"},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("last_name", resp.data["errors"])
        self.assertIn("first_name", resp.data["errors"])

    def test_register_creates_and_links_employee_no_admin_notice(self):
        User.objects.create_superuser(email="admin@alpha.family", password="Str0ng!Pass1")
        resp = self.client.post(
            "/api/auth/register/",
            {
                "email": "user@alpha.family",
                "password": "Str0ng!Pass1",
                "password_repeat": "Str0ng!Pass1",
                "last_name": "Петров",
                "first_name": "Пётр",
                "department": "ИТ",
                "position": "Инженер",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        user = User.objects.get(email="user@alpha.family")
        self.assertEqual(user.role, User.Role.EMPLOYEE)
        self.assertFalse(user.is_email_confirmed)
        # Сотрудник создан и связан.
        self.assertIsNotNone(user.employee)
        self.assertEqual(user.employee.last_name, "Петров")
        self.assertEqual(user.employee.first_name, "Пётр")
        self.assertEqual(user.employee.department, "ИТ")
        self.assertEqual(user.employee.position, "Инженер")
        # Только письмо-подтверждение пользователю, уведомления админам больше нет.
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, [user.email])

    def test_confirm_email_with_valid_token(self):
        self.client.post(
            "/api/auth/register/",
            {
                "email": "user@alpha.family",
                "password": "Str0ng!Pass1",
                "password_repeat": "Str0ng!Pass1",
                "last_name": "Петров",
                "first_name": "Пётр",
            },
            format="json",
        )
        from .tokens import make_email_confirmation_token

        user = User.objects.get(email="user@alpha.family")
        token = make_email_confirmation_token(user)
        resp = self.client.post("/api/auth/confirm-email/", {"token": token}, format="json")
        self.assertEqual(resp.status_code, 200, resp.data)
        user.refresh_from_db()
        self.assertTrue(user.is_email_confirmed)

    def test_confirm_email_rejects_garbage_token(self):
        resp = self.client.post("/api/auth/confirm-email/", {"token": "not-a-real-token"}, format="json")
        self.assertEqual(resp.status_code, 400)


class InviteAcceptTests(APITestCase):
    def test_invite_requires_admin(self):
        resp = self.client.post("/api/users/invite/", {"email": "x@example.com", "role": "employee"}, format="json")
        self.assertEqual(resp.status_code, 403)

    def test_invite_and_accept(self):
        admin = User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=admin)
        resp = self.client.post(
            "/api/users/invite/", {"email": "new@example.com", "role": "employee"}, format="json"
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(len(mail.outbox), 1)

        invited = User.objects.get(email="new@example.com")
        self.assertFalse(invited.has_usable_password())

        uid, token = make_set_password_link(invited)
        self.client.force_authenticate(user=None)
        resp = self.client.post(
            "/api/auth/accept-invite/",
            {"uid": uid, "token": token, "new_password": "An0ther!Pass", "new_password_repeat": "An0ther!Pass"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        invited.refresh_from_db()
        self.assertTrue(invited.check_password("An0ther!Pass"))
        self.assertTrue(invited.is_email_confirmed)

    def test_observer_flag_rejected_for_non_employee_role(self):
        admin = User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=admin)
        resp = self.client.post(
            "/api/users/invite/",
            {"email": "x@example.com", "role": "accountant", "is_observer": True},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_maintenance_scope_invite_and_update(self):
        """B23. Область типов ТО сохраняется при приглашении и правится при
        редактировании; смена роли сбрасывает флаги и область."""
        from equipment.models import EquipmentType

        admin = User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=admin)
        t1 = EquipmentType.objects.create(name="Тип 1", maintenance_enabled=True)
        t2 = EquipmentType.objects.create(name="Тип 2", maintenance_enabled=True)

        # Приглашение роли ТО с ограничением по типам.
        resp = self.client.post(
            "/api/users/invite/",
            {
                "email": "maint@example.com", "role": "maintenance",
                "maintenance_all_types": False, "maintenance_types": [t1.id, t2.id],
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        u = User.objects.get(email="maint@example.com")
        self.assertFalse(u.maintenance_all_types)
        self.assertEqual(set(u.maintenance_types.values_list("id", flat=True)), {t1.id, t2.id})

        # Правка через PATCH: сузить до одного типа.
        resp = self.client.patch(
            f"/api/users/{u.id}/",
            {"role": "maintenance", "maintenance_all_types": False, "maintenance_types": [t1.id]},
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        u.refresh_from_db()
        self.assertEqual(set(u.maintenance_types.values_list("id", flat=True)), {t1.id})

        # Смена роли на «Сотрудник» — флаги и область сбрасываются.
        resp = self.client.patch(f"/api/users/{u.id}/", {"role": "employee"}, format="json")
        self.assertEqual(resp.status_code, 200, resp.data)
        u.refresh_from_db()
        self.assertTrue(u.maintenance_all_types)
        self.assertEqual(u.maintenance_types.count(), 0)
        self.assertFalse(u.can_maintain)
        self.assertFalse(u.can_manage_regulations)

    def test_maintenance_flags_rejected_for_non_accountant(self):
        """B23. Флаги can_maintain/can_manage_regulations — только для учётчика."""
        admin = User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=admin)
        resp = self.client.post(
            "/api/users/invite/",
            {"email": "x@example.com", "role": "maintenance", "can_manage_regulations": True},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_reinvite_existing_unconfirmed_user_does_not_duplicate(self):
        admin = User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=admin)
        self.client.post("/api/users/invite/", {"email": "new@example.com", "role": "employee"}, format="json")
        self.client.post("/api/users/invite/", {"email": "new@example.com", "role": "accountant"}, format="json")
        self.assertEqual(User.objects.filter(email="new@example.com").count(), 1)
        self.assertEqual(User.objects.get(email="new@example.com").role, User.Role.ACCOUNTANT)

    def test_reinvite_confirmed_user_rejected(self):
        admin = User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")
        User.objects.create_user(email="taken@example.com", password="Str0ng!Pass1", is_email_confirmed=True)
        self.client.force_authenticate(user=admin)
        resp = self.client.post(
            "/api/users/invite/", {"email": "taken@example.com", "role": "employee"}, format="json"
        )
        self.assertEqual(resp.status_code, 400)

    def test_invite_create_employee_links_new_employee(self):
        from employees.models import Employee

        admin = User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=admin)
        resp = self.client.post(
            "/api/users/invite/",
            {
                "email": "new@example.com",
                "role": "employee",
                "create_employee": True,
                "last_name": "Сидоров",
                "first_name": "Семён",
                "department": "Бухгалтерия",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        user = User.objects.get(email="new@example.com")
        self.assertIsNotNone(user.employee)
        self.assertEqual(user.employee.last_name, "Сидоров")
        self.assertEqual(user.employee.department, "Бухгалтерия")
        self.assertEqual(Employee.objects.count(), 1)

    def test_invite_create_employee_requires_name(self):
        admin = User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=admin)
        resp = self.client.post(
            "/api/users/invite/",
            {"email": "new@example.com", "role": "employee", "create_employee": True},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("last_name", resp.data["errors"])

    def test_invite_create_employee_conflicts_with_existing(self):
        from employees.models import Employee

        admin = User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")
        existing = Employee.objects.create(first_name="Иван", last_name="Иванов")
        self.client.force_authenticate(user=admin)
        resp = self.client.post(
            "/api/users/invite/",
            {
                "email": "new@example.com",
                "role": "employee",
                "create_employee": True,
                "last_name": "Сидоров",
                "first_name": "Семён",
                "employee_id": existing.id,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_invite_smtp_failure_does_not_create_user(self):
        # SMTP недоступен → 502 и «осиротевшего» пользователя не остаётся
        # (транзакция в InviteSerializer.save() откатывается).
        admin = User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=admin)
        with mock.patch("accounts.emails.send_invite", side_effect=SMTPException("boom")):
            resp = self.client.post(
                "/api/users/invite/", {"email": "new@example.com", "role": "employee"}, format="json"
            )
        self.assertEqual(resp.status_code, 502)
        self.assertFalse(User.objects.filter(email="new@example.com").exists())


import tempfile  # noqa: E402

from django.core.files.uploadedfile import SimpleUploadedFile  # noqa: E402
from storage import backends as storage_backends  # noqa: E402

_USERS_TEST_MEDIA_ROOT = tempfile.mkdtemp(prefix="ele-users-tests-")


@override_settings(MEDIA_ROOT=_USERS_TEST_MEDIA_ROOT)
class UsersListEmployeeAvatarTests(APITestCase):
    """Список Пользователей отдаёт аватар связанного Сотрудника, чтобы UI
    показывал фото, а не заглушку по инициалам."""

    def setUp(self):
        from employees.models import Employee

        storage_backends._INSTANCES.pop("local", None)
        self.admin = User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=self.admin)
        self.employee = Employee.objects.create(first_name="Иван", last_name="Прозоров")
        self.user = User.objects.create_user(
            email="worker@example.com", password="Str0ng!Pass1", employee=self.employee
        )

    def _row(self, resp, email):
        return next(r for r in resp.data["results"] if r["email"] == email)

    def test_avatar_null_then_present(self):
        resp = self.client.get("/api/users/")
        self.assertIsNone(self._row(resp, "worker@example.com")["employee_avatar"])

        img = SimpleUploadedFile("ava.png", _PNG_1PX, content_type="image/png")
        resp = self.client.post(
            f"/api/employees/{self.employee.id}/avatar/", {"file": img}, format="multipart"
        )
        self.assertEqual(resp.status_code, 200, resp.data)

        resp = self.client.get("/api/users/")
        avatar = self._row(resp, "worker@example.com")["employee_avatar"]
        self.assertIsNotNone(avatar)
        self.assertEqual(avatar["original_filename"], "ava.png")


# 1×1 прозрачный PNG — валиден для проверки размеров аватара (≤600×600).
_PNG_1PX = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00"
    b"\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00"
    b"\x00IEND\xaeB`\x82"
)


class ChangeEmailTests(APITestCase):
    """Смена email из Профиля: повторная валидация домена,
    подтверждение переходом по ссылке (сам email меняется только тогда)."""

    def setUp(self):
        self.user = User.objects.create_user(email="old@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=self.user)

    def test_request_sends_confirmation_to_new_address(self):
        resp = self.client.post("/api/auth/change-email/", {"new_email": "new@example.com"}, format="json")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["new@example.com"])
        self.user.refresh_from_db()
        self.assertEqual(self.user.email, "old@example.com")  # email не меняется до подтверждения

    def test_request_rejects_email_already_taken(self):
        User.objects.create_user(email="taken@example.com", password="Str0ng!Pass1")
        resp = self.client.post("/api/auth/change-email/", {"new_email": "taken@example.com"}, format="json")
        self.assertEqual(resp.status_code, 400)

    def test_request_rejects_wrong_domain(self):
        company = Company.load()
        company.domain = "example.com"
        company.save()
        resp = self.client.post("/api/auth/change-email/", {"new_email": "new@other-domain.ru"}, format="json")
        self.assertEqual(resp.status_code, 400)

    def test_confirm_changes_email(self):
        from .tokens import make_email_change_token

        token = make_email_change_token(self.user, "new@example.com")
        resp = self.client.post("/api/auth/change-email/confirm/", {"token": token}, format="json")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.user.refresh_from_db()
        self.assertEqual(self.user.email, "new@example.com")
        self.assertTrue(self.user.is_email_confirmed)

    def test_confirm_rejects_garbage_token(self):
        resp = self.client.post("/api/auth/change-email/confirm/", {"token": "garbage"}, format="json")
        self.assertEqual(resp.status_code, 400)

    def test_confirm_works_without_authentication(self):
        # Симметрично confirm-email/accept-invite/password-reset — ссылка сама
        # себя аутентифицирует через подписанный токен, не сессией.
        from .tokens import make_email_change_token

        self.client.force_authenticate(user=None)
        token = make_email_change_token(self.user, "new2@example.com")
        resp = self.client.post("/api/auth/change-email/confirm/", {"token": token}, format="json")
        self.assertEqual(resp.status_code, 200, resp.data)


class PasswordResetTests(APITestCase):
    def test_neutral_response_regardless_of_account_existence(self):
        resp_existing = self.client.post("/api/auth/password-reset/", {"email": "ghost@example.com"}, format="json")
        User.objects.create_user(email="real@example.com", password="Str0ng!Pass1")
        resp_missing = self.client.post("/api/auth/password-reset/", {"email": "real@example.com"}, format="json")
        self.assertEqual(resp_existing.data, resp_missing.data)
        self.assertEqual(resp_existing.status_code, resp_missing.status_code, 200)
        # Письмо ушло только реальному владельцу.
        self.assertEqual(len(mail.outbox), 1)

    def test_reset_confirm_changes_password(self):
        user = User.objects.create_user(email="real@example.com", password="Old!Pass123")
        uid, token = make_set_password_link(user)
        resp = self.client.post(
            "/api/auth/password-reset/confirm/",
            {"uid": uid, "token": token, "new_password": "New!Pass456", "new_password_repeat": "New!Pass456"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        user.refresh_from_db()
        self.assertTrue(user.check_password("New!Pass456"))


class LoginBruteForceTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="worker@example.com", password="Correct!Pass1")

    def test_lockout_after_5_failed_attempts(self):
        for _ in range(4):
            resp = self.client.post(
                "/api/auth/login/", {"email": "worker@example.com", "password": "wrong"}, format="json"
            )
            self.assertEqual(resp.status_code, 400, resp.data)

        resp = self.client.post(
            "/api/auth/login/", {"email": "worker@example.com", "password": "wrong"}, format="json"
        )
        self.assertEqual(resp.status_code, 423, resp.data)

        # Верный пароль во время блокировки всё равно отклоняется.
        resp = self.client.post(
            "/api/auth/login/", {"email": "worker@example.com", "password": "Correct!Pass1"}, format="json"
        )
        self.assertEqual(resp.status_code, 423, resp.data)

    @override_settings(YANDEX_SMARTCAPTCHA_SITE_KEY="site", YANDEX_SMARTCAPTCHA_SECRET_KEY="secret")
    def test_captcha_required_from_3rd_attempt_when_enabled(self):
        # 1-я неудачная попытка: ответ ещё не требует капчу для следующей.
        resp = self.client.post(
            "/api/auth/login/", {"email": "worker@example.com", "password": "wrong"}, format="json"
        )
        self.assertEqual(resp.status_code, 400)
        self.assertFalse(resp.data.get("captcha_required", False))

        # 2-я неудачная попытка: ответ предупреждает, что 3-я потребует капчу
        # (фронт должен успеть отрисовать виджет до следующего сабмита).
        resp = self.client.post(
            "/api/auth/login/", {"email": "worker@example.com", "password": "wrong"}, format="json"
        )
        self.assertEqual(resp.status_code, 400)
        self.assertTrue(resp.data["captcha_required"])

        # 3-я попытка без токена капчи — отклоняется до проверки пароля.
        resp = self.client.post(
            "/api/auth/login/", {"email": "worker@example.com", "password": "wrong"}, format="json"
        )
        self.assertEqual(resp.status_code, 400)
        self.assertTrue(resp.data["captcha_required"])

    def test_captcha_not_required_when_disabled_all_the_way_to_lockout(self):
        # YANDEX_SMARTCAPTCHA_* пусты по умолчанию — капча не должна мешать.
        for _ in range(4):
            resp = self.client.post(
                "/api/auth/login/", {"email": "worker@example.com", "password": "wrong"}, format="json"
            )
            self.assertFalse(resp.data.get("captcha_required", False))
        resp = self.client.post(
            "/api/auth/login/", {"email": "worker@example.com", "password": "wrong"}, format="json"
        )
        self.assertEqual(resp.status_code, 423)

    def test_successful_login_resets_counter(self):
        self.client.post("/api/auth/login/", {"email": "worker@example.com", "password": "wrong"}, format="json")
        resp = self.client.post(
            "/api/auth/login/", {"email": "worker@example.com", "password": "Correct!Pass1"}, format="json"
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.user.refresh_from_db()
        self.assertEqual(self.user.failed_login_attempts, 0)

    def test_unknown_email_does_not_error(self):
        resp = self.client.post(
            "/api/auth/login/", {"email": "nobody@example.com", "password": "whatever"}, format="json"
        )
        self.assertEqual(resp.status_code, 400)


class SessionInvalidationTests(APITestCase):
    def test_password_change_keeps_current_session_but_would_drop_others(self):
        user = User.objects.create_user(email="worker@example.com", password="Old!Pass123")
        self.client.force_authenticate(user=user)
        # force_authenticate обходит SessionAuthentication, поэтому здесь
        # только проверяем, что эндпоинт работает и пароль реально меняется —
        # инвалидация сторонних сессий обеспечивается Django (get_session_auth_hash).
        resp = self.client.post(
            "/api/auth/change-password/",
            {"current_password": "Old!Pass123", "new_password": "New!Pass456", "new_password_repeat": "New!Pass456"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        user.refresh_from_db()
        self.assertTrue(user.check_password("New!Pass456"))
        self.assertIsNotNone(user.password_changed_at)  # «Пароль» блок в Профиле


class WeakPasswordErrorSurfacingTests(APITestCase):
    """Слабый пароль → 400 с ошибкой у поля пароля (а не в non_field_errors,
    где форма её не показывала бы). Покрывает все три формы задания пароля."""

    def test_register_weak_password_error_on_field(self):
        resp = self.client.post(
            "/api/auth/register/",
            {
                "email": "u@example.com",
                "password": "12345678",
                "password_repeat": "12345678",
                "last_name": "Петров",
                "first_name": "Пётр",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("password", resp.data["errors"])
        self.assertNotIn("non_field_errors", resp.data["errors"])

    def test_reset_confirm_weak_password_error_on_field(self):
        user = User.objects.create_user(email="real@example.com", password="Old!Pass123")
        uid, token = make_set_password_link(user)
        resp = self.client.post(
            "/api/auth/password-reset/confirm/",
            {"uid": uid, "token": token, "new_password": "12345678", "new_password_repeat": "12345678"},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("new_password", resp.data["errors"])

    def test_change_password_weak_password_error_on_field(self):
        user = User.objects.create_user(email="worker@example.com", password="Old!Pass123")
        self.client.force_authenticate(user=user)
        resp = self.client.post(
            "/api/auth/change-password/",
            {"current_password": "Old!Pass123", "new_password": "12345678", "new_password_repeat": "12345678"},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("new_password", resp.data["errors"])


class UserListTests(APITestCase):
    """ — список Пользователей курсорно пагинирован; User не имеет
    created_at (только date_joined), поэтому пагинатор должен сортировать
    по email, а не по дефолтному ordering ELECursorPagination."""

    def test_list_paginates_without_error(self):
        admin = User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")
        User.objects.create_user(email="worker@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=admin)
        resp = self.client.get("/api/users/")
        self.assertEqual(resp.status_code, 200, resp.data)
        emails = [u["email"] for u in resp.data["results"]]
        self.assertEqual(emails, sorted(emails))


class UserDeactivateTests(APITestCase):
    """Деактивация с уточняющей веткой по связанному Сотруднику."""

    def setUp(self):
        self.admin = User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=self.admin)

    def test_deactivate_with_employee_termination(self):
        from employees.models import Employee

        employee = Employee.objects.create(first_name="Иван", last_name="Прозоров")
        worker = User.objects.create_user(email="worker@example.com", password="Str0ng!Pass1", employee=employee)

        resp = self.client.post(f"/api/users/{worker.id}/deactivate/", {"terminate_employee": True}, format="json")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertTrue(resp.data["terminated_employee"])
        worker.refresh_from_db()
        employee.refresh_from_db()
        self.assertFalse(worker.is_active)
        self.assertFalse(employee.is_employed)

    def test_deactivate_without_termination_unlinks_employee(self):
        from employees.models import Employee

        employee = Employee.objects.create(first_name="Иван", last_name="Прозоров")
        worker = User.objects.create_user(email="worker@example.com", password="Str0ng!Pass1", employee=employee)

        resp = self.client.post(f"/api/users/{worker.id}/deactivate/", format="json")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertFalse(resp.data["terminated_employee"])
        worker.refresh_from_db()
        employee.refresh_from_db()
        self.assertFalse(worker.is_active)
        self.assertIsNone(worker.employee)
        self.assertTrue(employee.is_employed)  # остаётся «Работает»

    def test_deactivate_forbidden_for_non_admin(self):
        worker = User.objects.create_user(email="worker@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=worker)
        resp = self.client.post(f"/api/users/{self.admin.id}/deactivate/", format="json")
        self.assertEqual(resp.status_code, 403)

    def test_activate_reenables_login(self):
        worker = User.objects.create_user(
            email="worker@example.com", password="Str0ng!Pass1", is_active=False
        )
        resp = self.client.post(f"/api/users/{worker.id}/activate/", format="json")
        self.assertEqual(resp.status_code, 200, resp.data)
        worker.refresh_from_db()
        self.assertTrue(worker.is_active)

    def test_activate_forbidden_for_non_admin(self):
        worker = User.objects.create_user(email="worker@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=worker)
        resp = self.client.post(f"/api/users/{self.admin.id}/activate/", format="json")
        self.assertEqual(resp.status_code, 403)


@override_settings(YANDEX_ID_CLIENT_ID="cid", YANDEX_ID_CLIENT_SECRET="secret")
class YandexIDCallbackTests(APITestCase):
    """ — при первом входе через Яндекс ID создаётся и связанный Сотрудник
    из имени/фамилии Яндекса (или логина до @, если их нет)."""

    def _callback(self, info):
        session = self.client.session
        session["yandex_oauth_state"] = "st"
        session.save()
        with mock.patch("accounts.views.exchange_code_for_token", return_value="tok"), mock.patch(
            "accounts.views.fetch_user_info", return_value=info
        ):
            return self.client.get("/api/auth/yandex-id/callback/?state=st&code=code")

    def test_first_login_creates_user_and_employee_from_name(self):
        resp = self._callback({"email": "ivan@example.com", "first_name": "Иван", "last_name": "Петров"})
        self.assertEqual(resp.status_code, 302)
        user = User.objects.get(email="ivan@example.com")
        self.assertIsNotNone(user.employee)
        self.assertEqual(user.employee.first_name, "Иван")
        self.assertEqual(user.employee.last_name, "Петров")

    def test_first_login_without_name_falls_back_to_login_part(self):
        self._callback({"email": "ivan@example.com", "first_name": "", "last_name": ""})
        user = User.objects.get(email="ivan@example.com")
        self.assertEqual(user.employee.first_name, "ivan")
        self.assertEqual(user.employee.last_name, "ivan")

    def test_second_login_does_not_duplicate_employee(self):
        from employees.models import Employee

        emp = Employee.objects.create(first_name="Иван", last_name="Петров")
        User.objects.create_user(email="ivan@example.com", employee=emp, is_email_confirmed=True)
        self._callback({"email": "ivan@example.com", "first_name": "X", "last_name": "Y"})
        self.assertEqual(Employee.objects.count(), 1)
