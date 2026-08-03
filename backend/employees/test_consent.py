"""B51-R2. Фиксация согласия на обработку ПДн: документы компании, согласия
субъекта/оператора, дособирание, обезличивание."""

from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from company.models import Company, PdnDocument
from company.pdn import PdnDocumentError, set_document_from_link
from employees.models import Employee, EmployeeConsent
from employees.services import anonymize_employee, terminate_employee
from storage.service import store_bytes

User = get_user_model()


def make_current_doc(kind):
    sf = store_bytes(b"%PDF-1.4 test", f"{kind}.pdf", "pdn", content_type="application/pdf")
    return PdnDocument.objects.create(
        kind=kind, source_mode=PdnDocument.SourceMode.FILE, stored_file=sf, is_current=True
    )


def all_current_docs():
    return [make_current_doc(k) for k, _ in PdnDocument.Kind.choices]


class RegisterConsentTests(APITestCase):
    def setUp(self):
        c = Company.load()
        c.name = "Ромашка"
        c.inn = "7701234567"
        c.save()

    def _payload(self, **over):
        data = {
            "email": "new@e.ru",
            "password": "Str0ng!Pass1",
            "password_repeat": "Str0ng!Pass1",
            "last_name": "Петров",
            "first_name": "Пётр",
            "consent_acknowledged": True,
            "consent_agreed": True,
            "device": {"timezone": "Europe/Moscow", "screen": "1920×1080"},
        }
        data.update(over)
        return data

    def test_register_requires_both_consents(self):
        resp = self.client.post("/api/auth/register/", self._payload(consent_agreed=False), format="json")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("consent_agreed", resp.data["errors"])

    def test_register_records_self_consent_with_snapshot_and_documents(self):
        all_current_docs()
        resp = self.client.post("/api/auth/register/", self._payload(), format="json")
        self.assertEqual(resp.status_code, 201, resp.data)
        emp = User.objects.get(email="new@e.ru").employee
        consent = emp.consents.get(source=EmployeeConsent.Source.SELF)
        self.assertIsNotNone(consent.device_snapshot)
        self.assertEqual(consent.device_snapshot.get("timezone"), "Europe/Moscow")
        self.assertEqual(consent.documents.count(), 3)


class OperatorConsentTests(APITestCase):
    def setUp(self):
        self.admin_emp = Employee.objects.create(last_name="Иванов", first_name="Иван", position="Инженер")
        self.admin = User.objects.create_user(
            email="admin@e.ru", password="Str0ng!Pass1", role=User.Role.ADMIN, employee=self.admin_emp
        )
        self.client.force_authenticate(self.admin)

    def test_employee_create_requires_consent(self):
        resp = self.client.post(
            "/api/employees/", {"last_name": "Сидоров", "first_name": "Сидор"}, format="json"
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("consent_obtained", resp.data)

    def test_employee_create_records_operator_consent(self):
        make_current_doc(PdnDocument.Kind.CONSENT)
        resp = self.client.post(
            "/api/employees/",
            {"last_name": "Сидоров", "first_name": "Сидор", "consent_obtained": True},
            format="json",
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        emp = Employee.objects.get(last_name="Сидоров")
        consent = emp.consents.get(source=EmployeeConsent.Source.OPERATOR)
        self.assertEqual(consent.by_position, "Инженер")
        self.assertEqual(consent.by_name, "Иванов Иван")
        self.assertEqual(consent.documents.count(), 1)

    def test_invite_create_employee_requires_consent(self):
        resp = self.client.post(
            "/api/users/invite/",
            {"email": "z@e.ru", "role": "employee", "create_employee": True,
             "last_name": "Зайцев", "first_name": "Зот"},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("consent_obtained", resp.data["errors"])

    @patch("accounts.emails.send_invite")
    def test_invite_create_employee_records_operator_consent(self, _send):
        resp = self.client.post(
            "/api/users/invite/",
            {"email": "z@e.ru", "role": "employee", "create_employee": True,
             "last_name": "Зайцев", "first_name": "Зот", "consent_obtained": True},
            format="json",
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        emp = Employee.objects.get(last_name="Зайцев")
        self.assertTrue(emp.consents.filter(source=EmployeeConsent.Source.OPERATOR).exists())


class SelfConsentAndReminderTests(APITestCase):
    def setUp(self):
        self.emp = Employee.objects.create(last_name="Петров", first_name="Пётр")
        self.user = User.objects.create_user(
            email="worker@e.ru", password="Str0ng!Pass1", employee=self.emp
        )

    def test_me_needs_consent_flag_and_self_endpoint(self):
        self.client.force_authenticate(self.user)
        me = self.client.get("/api/auth/me/")
        self.assertTrue(me.data["needs_consent"])

        # Отметка оператора не снимает необходимость self-подтверждения.
        EmployeeConsent.objects.create(employee=self.emp, source=EmployeeConsent.Source.OPERATOR)
        me = self.client.get("/api/auth/me/")
        self.assertTrue(me.data["needs_consent"])

        resp = self.client.post(
            "/api/auth/me/consent/",
            {"consent_acknowledged": True, "consent_agreed": True, "device": {"screen": "800×600"}},
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        consent = self.emp.consents.get(source=EmployeeConsent.Source.SELF)
        self.assertEqual(consent.device_snapshot.get("screen"), "800×600")
        me = self.client.get("/api/auth/me/")
        self.assertFalse(me.data["needs_consent"])

    def test_self_consent_requires_both(self):
        self.client.force_authenticate(self.user)
        resp = self.client.post(
            "/api/auth/me/consent/", {"consent_acknowledged": True}, format="json"
        )
        self.assertEqual(resp.status_code, 400)

    def test_anonymize_clears_consent_snapshot(self):
        EmployeeConsent.objects.create(
            employee=self.emp, source=EmployeeConsent.Source.SELF, device_snapshot={"ip": "1.2.3.4"}
        )
        terminate_employee(self.emp, {}, actor=self.user)
        anonymize_employee(self.emp)
        consent = self.emp.consents.get(source=EmployeeConsent.Source.SELF)
        self.assertIsNone(consent.device_snapshot)


class PdnDocumentDownloadTests(APITestCase):
    @patch("company.pdn._guard_public_url", lambda url: None)
    @patch("company.pdn.requests.get")
    def test_link_html_rejected(self, mock_get):
        resp = MagicMock()
        resp.status_code = 200
        resp.headers = {"Content-Type": "text/html"}
        resp.iter_content = lambda n: [b"<!doctype html><html></html>"]
        resp.__enter__ = lambda s: s
        resp.__exit__ = lambda s, *a: False
        mock_get.return_value = resp
        with self.assertRaises(PdnDocumentError):
            set_document_from_link(PdnDocument.Kind.POLICY, "https://x/doc")

    @patch("company.pdn._guard_public_url", lambda url: None)
    @patch("company.pdn.requests.get")
    def test_link_non_200_rejected(self, mock_get):
        resp = MagicMock()
        resp.status_code = 404
        resp.headers = {}
        resp.iter_content = lambda n: []
        resp.__enter__ = lambda s: s
        resp.__exit__ = lambda s, *a: False
        mock_get.return_value = resp
        with self.assertRaises(PdnDocumentError):
            set_document_from_link(PdnDocument.Kind.POLICY, "https://x/missing")

    @patch("company.pdn._guard_public_url", lambda url: None)
    @patch("company.pdn.requests.get")
    def test_link_pdf_saved_as_current(self, mock_get):
        resp = MagicMock()
        resp.status_code = 200
        resp.headers = {"Content-Type": "application/pdf"}
        resp.iter_content = lambda n: [b"%PDF-1.4 data"]
        resp.__enter__ = lambda s: s
        resp.__exit__ = lambda s, *a: False
        mock_get.return_value = resp
        doc = set_document_from_link(PdnDocument.Kind.CONSENT, "https://x/consent.pdf")
        self.assertTrue(doc.is_current)
        self.assertEqual(doc.stored_file.original_filename, "consent.pdf")
