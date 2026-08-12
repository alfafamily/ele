"""B44. Тесты уведомлений: доступность видов по ролям, область типов, дедуп
напоминаний о ТО, gate писем/push по настройкам, подписки Web Push."""
from datetime import datetime, time, timedelta
from types import SimpleNamespace
from zoneinfo import ZoneInfo

from django.core import mail
from django.core.management import call_command
from django.test import SimpleTestCase, override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from core.testutils import open_notification_window

from equipment.models import (
    Equipment,
    EquipmentMaintenancePlan,
    EquipmentType,
    MaintenanceRegulation,
)

from .models import (
    MaintenanceReminderState,
    NotificationKind,
    NotificationPreference,
    PushSubscription,
    QueuedNotification,
    User,
)
from .notifications import (
    can_configure_types,
    domains_for,
    eligible_kinds,
    notify_assignment_pending,
    recipients_for_maintenance,
    type_in_scope,
)
from .notify_window import next_window_start, within_window

K = NotificationKind


def mk(email, role, **kw):
    return User.objects.create_user(email=email, password="Str0ng!Pass1", role=role, **kw)


class EligibilityTests(APITestCase):
    def test_kinds_by_role(self):
        admin = mk("a@e.com", User.Role.ADMIN)
        acc = mk("acc@e.com", User.Role.ACCOUNTANT)
        acc_m = mk("accm@e.com", User.Role.ACCOUNTANT, can_maintain=True)
        mech = mk("m@e.com", User.Role.MAINTENANCE)
        auto = mk("auto@e.com", User.Role.AUTOMECHANIC)
        emp = mk("emp@e.com", User.Role.EMPLOYEE)

        self.assertEqual(eligible_kinds(admin), {K.ASSIGNMENT_PENDING, K.ASSIGNMENT_REJECTED, K.MAINTENANCE_DUE, K.MAINTENANCE_OVERDUE, K.MAINTENANCE_PERFORMED})
        self.assertEqual(eligible_kinds(acc), {K.ASSIGNMENT_PENDING, K.ASSIGNMENT_REJECTED, K.MAINTENANCE_PERFORMED})
        self.assertIn(K.MAINTENANCE_DUE, eligible_kinds(acc_m))
        self.assertEqual(eligible_kinds(mech), {K.ASSIGNMENT_PENDING, K.MAINTENANCE_DUE, K.MAINTENANCE_OVERDUE})
        self.assertEqual(eligible_kinds(auto), {K.ASSIGNMENT_PENDING, K.MAINTENANCE_DUE, K.MAINTENANCE_OVERDUE})
        self.assertEqual(eligible_kinds(emp), {K.ASSIGNMENT_PENDING})
        # Отказ от закрепления — только admin и accountant.
        self.assertIn(K.ASSIGNMENT_REJECTED, eligible_kinds(acc))
        self.assertNotIn(K.ASSIGNMENT_REJECTED, eligible_kinds(mech))
        self.assertNotIn(K.ASSIGNMENT_REJECTED, eligible_kinds(emp))

    def test_domains_and_configurable(self):
        admin = mk("a@e.com", User.Role.ADMIN)
        mech = mk("m@e.com", User.Role.MAINTENANCE)
        auto = mk("auto@e.com", User.Role.AUTOMECHANIC)
        acc_eq = mk("acc@e.com", User.Role.ACCOUNTANT, can_maintain=True)

        self.assertEqual(domains_for(admin, K.MAINTENANCE_DUE), {"equipment", "transport"})
        self.assertEqual(domains_for(mech, K.MAINTENANCE_DUE), {"equipment"})
        self.assertEqual(domains_for(auto, K.MAINTENANCE_DUE), {"transport"})
        self.assertEqual(domains_for(acc_eq, K.MAINTENANCE_DUE), {"equipment"})
        self.assertEqual(domains_for(admin, K.MAINTENANCE_PERFORMED), {"equipment", "transport"})

        self.assertTrue(can_configure_types(admin, K.MAINTENANCE_DUE))
        self.assertFalse(can_configure_types(mech, K.MAINTENANCE_DUE))
        self.assertFalse(can_configure_types(admin, K.ASSIGNMENT_PENDING))


class PreferencesApiTests(APITestCase):
    def setUp(self):
        self.admin = mk("admin@e.com", User.Role.ADMIN)
        self.emp = mk("emp@e.com", User.Role.EMPLOYEE)
        self.t1 = EquipmentType.objects.create(name="ПК", maintenance_enabled=True)
        self.t2 = EquipmentType.objects.create(name="Принтеры", maintenance_enabled=True)

    def test_admin_sees_all_rows_employee_one(self):
        self.client.force_authenticate(self.admin)
        data = self.client.get("/api/notifications/preferences/").data
        kinds = [it["kind"] for it in data["items"]]
        self.assertEqual(kinds, ["assignment_pending", "assignment_rejected", "maintenance_due", "maintenance_overdue", "maintenance_performed"])
        due = next(it for it in data["items"] if it["kind"] == "maintenance_due")
        self.assertTrue(due["configurable_types"])
        self.assertEqual(due["domains"], ["equipment", "transport"])
        self.assertEqual(len(data["equipment_types"]), 2)

        self.client.force_authenticate(self.emp)
        data = self.client.get("/api/notifications/preferences/").data
        self.assertEqual([it["kind"] for it in data["items"]], ["assignment_pending"])

    def test_toggle_channel_persists(self):
        self.client.force_authenticate(self.admin)
        resp = self.client.patch("/api/notifications/preferences/", {"kind": "assignment_pending", "email_enabled": False}, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(resp.data["email_enabled"])
        pref = NotificationPreference.objects.get(user=self.admin, kind="assignment_pending")
        self.assertFalse(pref.email_enabled)

    def test_scope_narrowing(self):
        self.client.force_authenticate(self.admin)
        self.client.patch("/api/notifications/preferences/", {
            "kind": "maintenance_due", "equipment_all_types": False, "equipment_type_ids": [self.t1.id],
        }, format="json")
        self.admin.refresh_from_db()
        self.assertTrue(type_in_scope(self.admin, K.MAINTENANCE_DUE, "equipment", self.t1.id))
        self.assertFalse(type_in_scope(self.admin, K.MAINTENANCE_DUE, "equipment", self.t2.id))

    def test_employee_cannot_patch_maintenance(self):
        self.client.force_authenticate(self.emp)
        resp = self.client.patch("/api/notifications/preferences/", {"kind": "maintenance_due", "email_enabled": False}, format="json")
        self.assertEqual(resp.status_code, 400)


class RecipientsTests(APITestCase):
    def setUp(self):
        self.t = EquipmentType.objects.create(name="ПК", maintenance_enabled=True)
        self.other = EquipmentType.objects.create(name="Принтеры", maintenance_enabled=True)
        self.admin = mk("admin@e.com", User.Role.ADMIN)
        self.acc = mk("acc@e.com", User.Role.ACCOUNTANT, can_maintain=True)
        self.mech = mk("mech@e.com", User.Role.MAINTENANCE)
        self.emp = mk("emp@e.com", User.Role.EMPLOYEE)

    def _ids(self, kind, domain, type_id):
        return {u.id for u, _, _ in recipients_for_maintenance(kind, domain, type_id)}

    def test_due_recipients_include_maintainers(self):
        ids = self._ids(K.MAINTENANCE_DUE, "equipment", self.t.id)
        self.assertEqual(ids, {self.admin.id, self.acc.id, self.mech.id})

    def test_mechanic_scope_limits(self):
        self.mech.maintenance_all_types = False
        self.mech.save()
        self.mech.maintenance_types.set([self.other])
        self.assertNotIn(self.mech.id, self._ids(K.MAINTENANCE_DUE, "equipment", self.t.id))
        self.assertIn(self.mech.id, self._ids(K.MAINTENANCE_DUE, "equipment", self.other.id))

    def test_pref_narrowing_excludes(self):
        pref, _ = NotificationPreference.objects.get_or_create(user=self.admin, kind=K.MAINTENANCE_DUE)
        pref.equipment_all_types = False
        pref.save()
        pref.equipment_types.set([self.other])
        self.assertNotIn(self.admin.id, self._ids(K.MAINTENANCE_DUE, "equipment", self.t.id))

    def test_channel_off_still_listed_with_flags(self):
        pref, _ = NotificationPreference.objects.get_or_create(user=self.acc, kind=K.MAINTENANCE_DUE)
        pref.email_enabled = False
        pref.push_enabled = True
        pref.save()
        rec = {u.id: (e, p) for u, e, p in recipients_for_maintenance(K.MAINTENANCE_DUE, "equipment", self.t.id)}
        self.assertEqual(rec[self.acc.id], (False, True))


class ReminderCommandTests(APITestCase):
    def setUp(self):
        from core.testutils import open_notification_window

        open_notification_window()  # рассылка идёт сразу, не в очередь по окну
        self.admin = mk("admin@e.com", User.Role.ADMIN)
        self.type = EquipmentType.objects.create(name="ПК", maintenance_enabled=True)
        self.eq = Equipment.objects.create(inventory_number="INV-1", equipment_type=self.type)
        self.reg = MaintenanceRegulation.objects.create(equipment_type=self.type, name="Плановое", period_months=3)
        self.plan = EquipmentMaintenancePlan.objects.create(equipment=self.eq, regulation=self.reg)

    def test_overdue_sent_once_then_deduped(self):
        self.plan.next_planned_date = timezone.localdate() - timedelta(days=1)
        self.plan.save()
        call_command("send_maintenance_reminders")
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("Просрочено", mail.outbox[0].subject)
        state = MaintenanceReminderState.objects.get(plan_kind="equipment", plan_id=self.plan.id)
        self.assertEqual(state.notified_status, "overdue")

        mail.outbox.clear()
        call_command("send_maintenance_reminders")
        self.assertEqual(len(mail.outbox), 0)

    def test_status_leaves_resets_state(self):
        self.plan.next_planned_date = timezone.localdate() - timedelta(days=1)
        self.plan.save()
        call_command("send_maintenance_reminders")
        mail.outbox.clear()
        # ТО «проведено» — дата ушла в будущее (не подходит/не просрочено).
        self.plan.next_planned_date = timezone.localdate() + timedelta(days=90)
        self.plan.save()
        call_command("send_maintenance_reminders")
        state = MaintenanceReminderState.objects.get(plan_kind="equipment", plan_id=self.plan.id)
        self.assertEqual(state.notified_status, "")
        self.assertEqual(len(mail.outbox), 0)

    def test_due_soon_sends(self):
        self.plan.next_planned_date = timezone.localdate() + timedelta(days=3)
        self.plan.save()
        call_command("send_maintenance_reminders")
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("Приближается", mail.outbox[0].subject)


class AssignmentGatingTests(APITestCase):
    def setUp(self):
        from core.testutils import open_notification_window

        open_notification_window()  # рассылка идёт сразу, не в очередь по окну
        self.emp = mk("emp@e.com", User.Role.EMPLOYEE)

    def test_email_sent_by_default(self):
        notify_assignment_pending(self.emp, SimpleNamespace(content_object=None, id=1))
        self.assertEqual(len(mail.outbox), 1)

    def test_email_suppressed_when_disabled(self):
        NotificationPreference.objects.create(user=self.emp, kind=K.ASSIGNMENT_PENDING, email_enabled=False)
        notify_assignment_pending(self.emp, SimpleNamespace(content_object=None, id=1))
        self.assertEqual(len(mail.outbox), 0)


class PushApiTests(APITestCase):
    def setUp(self):
        self.user = mk("u@e.com", User.Role.EMPLOYEE)
        self.client.force_authenticate(self.user)

    def test_subscribe_and_unsubscribe(self):
        body = {"endpoint": "https://push.example/abc", "keys": {"p256dh": "k", "auth": "a"}}
        self.assertEqual(self.client.post("/api/notifications/push/subscribe/", body, format="json").status_code, 204)
        self.assertTrue(PushSubscription.objects.filter(user=self.user, endpoint=body["endpoint"]).exists())
        self.assertEqual(self.client.post("/api/notifications/push/unsubscribe/", {"endpoint": body["endpoint"]}, format="json").status_code, 204)
        self.assertFalse(PushSubscription.objects.filter(endpoint=body["endpoint"]).exists())

    def test_vapid_key_reports_unconfigured(self):
        data = self.client.get("/api/notifications/push/vapid-key/").data
        self.assertFalse(data["configured"])

    @override_settings(VAPID_PUBLIC_KEY="pub", VAPID_PRIVATE_KEY="priv")
    def test_vapid_key_reports_configured(self):
        data = self.client.get("/api/notifications/push/vapid-key/").data
        self.assertTrue(data["configured"])
        self.assertEqual(data["public_key"], "pub")


# ─── Окно отправки уведомлений (push + письма) ──────────────────────────────

class NotifyWindowLogicTests(SimpleTestCase):
    """Чистая логика окна (без БД): within_window / next_window_start."""

    def _c(self, start, end, tz="UTC"):
        return SimpleNamespace(notify_window_start=start, notify_window_end=end, notify_window_timezone=tz)

    def test_normal_window(self):
        c = self._c(time(9, 0), time(21, 0))
        base = datetime(2026, 8, 12, tzinfo=ZoneInfo("UTC"))
        self.assertFalse(within_window(base.replace(hour=8), company=c))
        self.assertTrue(within_window(base.replace(hour=9), company=c))
        self.assertTrue(within_window(base.replace(hour=20, minute=59), company=c))
        self.assertFalse(within_window(base.replace(hour=21), company=c))  # верхняя граница исключена

    def test_cross_midnight_window(self):
        c = self._c(time(22, 0), time(6, 0))
        base = datetime(2026, 8, 12, tzinfo=ZoneInfo("UTC"))
        self.assertTrue(within_window(base.replace(hour=23), company=c))
        self.assertTrue(within_window(base.replace(hour=5), company=c))
        self.assertFalse(within_window(base.replace(hour=12), company=c))

    def test_round_the_clock(self):
        c = self._c(time(0, 0), time(0, 0))  # start == end
        self.assertTrue(within_window(datetime(2026, 8, 12, 3, tzinfo=ZoneInfo("UTC")), company=c))

    def test_next_window_start_today_then_tomorrow(self):
        c = self._c(time(9, 0), time(21, 0))
        base = datetime(2026, 8, 12, tzinfo=ZoneInfo("UTC"))
        self.assertEqual(next_window_start(base.replace(hour=4), company=c), datetime(2026, 8, 12, 9, tzinfo=ZoneInfo("UTC")))
        self.assertEqual(next_window_start(base.replace(hour=22), company=c), datetime(2026, 8, 13, 9, tzinfo=ZoneInfo("UTC")))

    def test_next_window_start_respects_timezone(self):
        c = self._c(time(9, 0), time(21, 0), tz="Europe/Moscow")  # UTC+3
        base = datetime(2026, 8, 12, 2, tzinfo=ZoneInfo("UTC"))  # 05:00 MSK
        # 09:00 MSK = 06:00 UTC того же дня
        self.assertEqual(next_window_start(base, company=c), datetime(2026, 8, 12, 6, tzinfo=ZoneInfo("UTC")))


class QueuedDeliveryTests(APITestCase):
    """Событие вне окна ставится в очередь; команда сливает её только в окне."""

    def setUp(self):
        self.emp = mk("emp@e.com", User.Role.EMPLOYEE)

    def _close_window(self):
        # Окно, гарантированно НЕ содержащее «сейчас» (начинается через час).
        from company.models import Company

        now = timezone.now()
        c = Company.load()
        c.notify_window_timezone = "UTC"
        c.notify_window_start = (now + timedelta(hours=1)).time().replace(microsecond=0)
        c.notify_window_end = (now + timedelta(hours=2)).time().replace(microsecond=0)
        c.save()
        return c

    def test_event_outside_window_is_queued_not_sent(self):
        self._close_window()
        notify_assignment_pending(self.emp, SimpleNamespace(content_object=None, id=1))
        self.assertEqual(len(mail.outbox), 0)  # ничего не ушло сразу
        q = QueuedNotification.objects.filter(user=self.emp)
        self.assertEqual(set(q.values_list("channel", flat=True)), {"email", "push"})
        self.assertTrue(all(row.scheduled_for > timezone.now() for row in q))  # на будущее окно

    def test_within_window_sends_immediately(self):
        open_notification_window()
        notify_assignment_pending(self.emp, SimpleNamespace(content_object=None, id=1))
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(QueuedNotification.objects.count(), 0)

    def test_drain_noop_outside_window_then_sends(self):
        self._close_window()
        notify_assignment_pending(self.emp, SimpleNamespace(content_object=None, id=1))
        # Окно закрыто — команда ничего не отправляет и не удаляет.
        call_command("send_queued_notifications")
        self.assertEqual(len(mail.outbox), 0)
        self.assertEqual(QueuedNotification.objects.count(), 2)
        # Окно открыто и запись «созрела» — слив отправляет письмо и чистит очередь.
        open_notification_window()
        QueuedNotification.objects.update(scheduled_for=timezone.now() - timedelta(minutes=1))
        call_command("send_queued_notifications")
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(QueuedNotification.objects.count(), 0)


class NotificationWindowApiTests(APITestCase):
    def setUp(self):
        self.admin = mk("admin@e.com", User.Role.ADMIN)
        self.emp = mk("emp@e.com", User.Role.EMPLOYEE)

    def test_admin_updates_window(self):
        self.client.force_authenticate(self.admin)
        resp = self.client.patch(
            "/api/company/notification-settings/",
            {"notify_window_start": "08:30", "notify_window_end": "19:00", "notify_window_timezone": "Europe/Moscow"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["notify_window_start"], "08:30:00")
        self.assertEqual(resp.data["notify_window_timezone"], "Europe/Moscow")

    def test_invalid_timezone_rejected(self):
        self.client.force_authenticate(self.admin)
        resp = self.client.patch(
            "/api/company/notification-settings/", {"notify_window_timezone": "Mars/Phobos"}, format="json"
        )
        self.assertEqual(resp.status_code, 400)

    def test_non_admin_forbidden(self):
        self.client.force_authenticate(self.emp)
        self.assertEqual(self.client.get("/api/company/notification-settings/").status_code, 403)
