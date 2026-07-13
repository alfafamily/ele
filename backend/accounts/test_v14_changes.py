"""Тесты v1.4 (Пользователи): приглашение при несовпадении домена требует
явного подтверждения; редактирование пользователя (роль/сотрудник) из карточки."""
from company.models import Company
from employees.models import Employee
from rest_framework.test import APITestCase

from .models import User


class InviteDomainConfirmationTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(email="admin@romashka.ru", password="Str0ng!Pass1")
        self.client.force_authenticate(self.admin)
        company = Company.load()
        company.domain = "romashka.ru"
        company.save(update_fields=["domain"])

    def test_mismatched_domain_requires_confirmation(self):
        resp = self.client.post("/api/users/invite/", {"email": "x@other.ru", "role": "employee"}, format="json")
        self.assertEqual(resp.status_code, 409, resp.data)
        self.assertTrue(resp.data.get("requires_domain_confirmation"))
        self.assertFalse(User.objects.filter(email="x@other.ru").exists())

        resp = self.client.post(
            "/api/users/invite/", {"email": "x@other.ru", "role": "employee", "confirm_domain": True}, format="json"
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertTrue(User.objects.filter(email="x@other.ru").exists())

    def test_matching_domain_invites_directly(self):
        resp = self.client.post("/api/users/invite/", {"email": "y@romashka.ru", "role": "employee"}, format="json")
        self.assertEqual(resp.status_code, 201, resp.data)


class EditUserTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(self.admin)
        self.user = User.objects.create(email="worker@example.com", role=User.Role.EMPLOYEE)
        self.emp = Employee.objects.create(first_name="Пётр", last_name="Петров")

    def test_change_role_and_link_employee(self):
        resp = self.client.patch(
            f"/api/users/{self.user.id}/",
            {"role": "accountant", "employee": self.emp.id, "is_observer": False},
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.user.refresh_from_db()
        self.assertEqual(self.user.role, "accountant")
        self.assertEqual(self.user.employee_id, self.emp.id)

    def test_unlink_employee(self):
        self.user.employee = self.emp
        self.user.save(update_fields=["employee"])
        resp = self.client.patch(f"/api/users/{self.user.id}/", {"employee": None}, format="json")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.user.refresh_from_db()
        self.assertIsNone(self.user.employee_id)
