"""B51-R1 — обезличивание ПДн субъекта (H1) + авто-ретеншен по сроку (H2)."""

from datetime import timedelta

from accounts.models import PushSubscription, User
from company.models import Company
from django.contrib.contenttypes.models import ContentType
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from equipment.models import Equipment, EquipmentType
from rest_framework.test import APITestCase
from storage.models import StoredFile
from storage.service import store_uploaded_file

from .models import Employee, EmployeeAssignment
from .services import (
    AnonymizeError,
    anonymize_due_employees,
    anonymize_employee,
    terminate_employee,
)


def _emp(last="Прозоров", first="Иван", **kw):
    return Employee.objects.create(last_name=last, first_name=first, **kw)


class AnonymizeServiceTests(APITestCase):
    def setUp(self):
        self.eq_type = EquipmentType.objects.create(name="ПК")

    def _snapshot_assignment(self, emp):
        """Закрытый эпизод акцепта со слепком устройства (ПДн)."""
        eq = Equipment.objects.create(inventory_number="PC-1", equipment_type=self.eq_type)
        return EmployeeAssignment.objects.create(
            content_type=ContentType.objects.get_for_model(Equipment),
            object_id=eq.id,
            object_kind=EmployeeAssignment.ObjectKind.EQUIPMENT,
            employee=emp,
            status=EmployeeAssignment.Status.ACCEPTED,
            device_snapshot={"ip": "203.0.113.7", "os": "Windows", "timezone": "Europe/Moscow"},
            closed_at=timezone.now(),
        )

    def test_anonymize_erases_subject_pii(self):
        emp = _emp(last="Петров", first="Михаил", position="Инженер", department="ИТ", is_employed=False)
        emp.terminated_at = timezone.now()
        emp.avatar = store_uploaded_file(
            SimpleUploadedFile("a.png", b"\x89PNG\r\n", content_type="image/png"), "employees/avatars"
        )
        emp.save()
        avatar_id = emp.avatar_id
        user = User.objects.create_user(email="mp@e.ru", password="Str0ng!Pass1", employee=emp)
        PushSubscription.objects.create(user=user, endpoint="https://push/x", p256dh="k", auth="a")
        a = self._snapshot_assignment(emp)

        # B56-R1 (#9): удаление бинарника аватара отложено на transaction.on_commit
        # (чтобы откат @atomic не оставил висячую ссылку). В тесте фиксируем и
        # исполняем after-commit-колбэки, иначе файл не удалится внутри TestCase.
        with self.captureOnCommitCallbacks(execute=True):
            anonymize_employee(emp)

        emp.refresh_from_db()
        # ФИО стёрто → «Удалён»; должность/отдел сохранены (не ПДн).
        self.assertEqual(str(emp), "Удалён")
        self.assertEqual(emp.first_name, "")
        self.assertEqual(emp.position, "Инженер")
        self.assertEqual(emp.department, "ИТ")
        self.assertTrue(emp.is_anonymized)
        self.assertIsNotNone(emp.anonymized_at)
        # Аватар: файл и запись StoredFile удалены.
        self.assertIsNone(emp.avatar_id)
        self.assertFalse(StoredFile.objects.filter(id=avatar_id).exists())
        # Учётка: технический email, вход невозможен, деактивирована.
        user.refresh_from_db()
        self.assertTrue(user.email.startswith("deleted+"))
        self.assertTrue(user.email.endswith("@anonymized.invalid"))
        self.assertFalse(user.is_active)
        self.assertFalse(user.check_password("Str0ng!Pass1"))
        self.assertEqual(user.push_subscriptions.count(), 0)
        # Слепок устройства обнулён.
        a.refresh_from_db()
        self.assertIsNone(a.device_snapshot)

    def test_anonymize_requires_terminated(self):
        emp = _emp(is_employed=True)
        with self.assertRaises(AnonymizeError):
            anonymize_employee(emp)

    def test_anonymize_is_not_repeatable(self):
        emp = _emp(is_employed=False)
        emp.terminated_at = timezone.now()
        emp.save()
        anonymize_employee(emp)
        with self.assertRaises(AnonymizeError):
            anonymize_employee(emp)

    def test_terminate_sets_timestamp_restore_clears(self):
        admin = User.objects.create_user(email="a@e.ru", password="Str0ng!Pass1", role=User.Role.ADMIN)
        emp = _emp(is_employed=True)
        terminate_employee(emp, {}, actor=admin)
        emp.refresh_from_db()
        self.assertFalse(emp.is_employed)
        self.assertIsNotNone(emp.terminated_at)
        # Восстановление сбрасывает таймер.
        self.client.force_authenticate(admin)
        resp = self.client.post(f"/api/employees/{emp.id}/restore/")
        self.assertEqual(resp.status_code, 200)
        emp.refresh_from_db()
        self.assertTrue(emp.is_employed)
        self.assertIsNone(emp.terminated_at)

    def test_restore_and_edit_blocked_after_anonymize(self):
        admin = User.objects.create_user(email="a@e.ru", password="Str0ng!Pass1", role=User.Role.ADMIN)
        emp = _emp(is_employed=False)
        emp.terminated_at = timezone.now()
        emp.save()
        anonymize_employee(emp)
        self.client.force_authenticate(admin)
        self.assertEqual(self.client.post(f"/api/employees/{emp.id}/restore/").status_code, 409)
        resp = self.client.patch(f"/api/employees/{emp.id}/", {"first_name": "Иван"}, format="json")
        self.assertEqual(resp.status_code, 409)


class AnonymizeRetentionTests(APITestCase):
    def test_due_respects_threshold_and_disable(self):
        c = Company.load()
        c.anonymize_after_months = 12
        c.save()
        old = _emp(last="Старый", is_employed=False)
        old.terminated_at = timezone.now() - timedelta(days=400)
        old.save()
        recent = _emp(last="Недавний", is_employed=False)
        recent.terminated_at = timezone.now() - timedelta(days=30)
        recent.save()
        active = _emp(last="Активный", is_employed=True)

        count = anonymize_due_employees()
        self.assertEqual(count, 1)
        old.refresh_from_db()
        recent.refresh_from_db()
        active.refresh_from_db()
        self.assertTrue(old.is_anonymized)
        self.assertFalse(recent.is_anonymized)
        self.assertFalse(active.is_anonymized)

    def test_zero_months_disables_auto(self):
        c = Company.load()
        c.anonymize_after_months = 0
        c.save()
        old = _emp(is_employed=False)
        old.terminated_at = timezone.now() - timedelta(days=400)
        old.save()
        self.assertEqual(anonymize_due_employees(), 0)
        old.refresh_from_db()
        self.assertFalse(old.is_anonymized)
