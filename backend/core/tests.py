from django.core.management import call_command
from rest_framework.test import APITestCase

from company.models import Company

from .ip_allowlist import is_ip_allowed


class IsIPAllowedTests(APITestCase):
    """Модульная проверка сопоставления IP/CIDR — независимо от HTTP-слоя."""

    def test_empty_allowlist_means_unrestricted(self):
        self.assertTrue(is_ip_allowed("1.2.3.4", []))

    def test_exact_match(self):
        self.assertTrue(is_ip_allowed("10.0.0.5", ["10.0.0.5"]))
        self.assertFalse(is_ip_allowed("10.0.0.6", ["10.0.0.5"]))

    def test_cidr_match(self):
        self.assertTrue(is_ip_allowed("195.19.0.42", ["195.19.0.0/16"]))
        self.assertFalse(is_ip_allowed("195.20.0.1", ["195.19.0.0/16"]))

    def test_garbage_client_ip_is_rejected_not_500(self):
        self.assertFalse(is_ip_allowed("not-an-ip", ["10.0.0.0/8"]))

    def test_garbage_allowlist_entry_is_skipped(self):
        self.assertTrue(is_ip_allowed("10.0.0.5", ["not-an-entry", "10.0.0.5"]))


class IPCheckViewTests(APITestCase):
    """Эндпоинт для Caddy forward_auth. Реальный IP клиента
    берётся из ПОСЛЕДНЕГО значения X-Forwarded-For (Caddy сам его дописывает
    последним; более ранние значения мог подделать клиент)."""

    def test_no_restriction_by_default(self):
        resp = self.client.get("/api/internal/ip-check/")
        self.assertEqual(resp.status_code, 200)

    def test_blocks_ip_outside_allowlist(self):
        company = Company.load()
        company.ip_allowlist = ["203.0.113.0/24"]
        company.save()
        resp = self.client.get("/api/internal/ip-check/", HTTP_X_FORWARDED_FOR="198.51.100.7")
        self.assertEqual(resp.status_code, 403)

    def test_allows_ip_inside_allowlist(self):
        company = Company.load()
        company.ip_allowlist = ["203.0.113.0/24"]
        company.save()
        resp = self.client.get("/api/internal/ip-check/", HTTP_X_FORWARDED_FOR="203.0.113.42")
        self.assertEqual(resp.status_code, 200)

    def test_trusts_last_xff_entry_not_first(self):
        # Первое значение — то, что мог подделать клиент; последнее — то, что
        # реально дописал Caddy. Разрешённый только последний адрес.
        company = Company.load()
        company.ip_allowlist = ["203.0.113.0/24"]
        company.save()
        resp = self.client.get(
            "/api/internal/ip-check/", HTTP_X_FORWARDED_FOR="203.0.113.42, 198.51.100.7"
        )
        self.assertEqual(resp.status_code, 403)

    def test_blocked_browser_gets_styled_html(self):
        # Браузер (Accept: text/html) при блокировке должен получить
        # стилизованную HTML-страницу, а не сырой DRF browsable-API.
        company = Company.load()
        company.ip_allowlist = ["203.0.113.0/24"]
        company.save()
        resp = self.client.get(
            "/api/internal/ip-check/",
            HTTP_X_FORWARDED_FOR="198.51.100.7",
            HTTP_ACCEPT="text/html",
        )
        self.assertEqual(resp.status_code, 403)
        self.assertIn("text/html", resp["Content-Type"])
        self.assertIn("Доступ ограничен", resp.content.decode())

    def test_blocked_api_client_gets_json(self):
        # API-клиент (Accept: application/json) при блокировке — прежний JSON.
        company = Company.load()
        company.ip_allowlist = ["203.0.113.0/24"]
        company.save()
        resp = self.client.get(
            "/api/internal/ip-check/",
            HTTP_X_FORWARDED_FOR="198.51.100.7",
            HTTP_ACCEPT="application/json",
        )
        self.assertEqual(resp.status_code, 403)
        self.assertIn("application/json", resp["Content-Type"])
        self.assertIn("IP-адреса", resp.json()["detail"])


class ResetIPAllowlistCommandTests(APITestCase):
    def test_clears_allowlist(self):
        company = Company.load()
        company.ip_allowlist = ["10.0.0.0/8"]
        company.save()
        call_command("reset_ip_allowlist")
        company.refresh_from_db()
        self.assertEqual(company.ip_allowlist, [])

    def test_noop_when_already_empty(self):
        call_command("reset_ip_allowlist")  # не должно падать
        self.assertEqual(Company.load().ip_allowlist, [])


# ---------------------------------------------------------------------------
# B42. Cron-задача напоминаний о ТО: вход в статус (подходит/просрочено) шлёт
# один раз (дедуп по MaintenanceReminderState), выход из статуса сбрасывает
# отметку, сбой домена изолируется и попадает в журнал фоновых задач.
# ---------------------------------------------------------------------------
from datetime import timedelta  # noqa: E402
from unittest import mock  # noqa: E402

from django.utils import timezone  # noqa: E402


class MaintenanceReminderCronTests(APITestCase):
    def setUp(self):
        from equipment.models import (
            Equipment,
            EquipmentType,
            MaintenanceRegulation,
            EquipmentMaintenancePlan,
        )

        from core.testutils import open_notification_window

        open_notification_window()  # рассылка ТО идёт сразу, не в очередь по окну
        self.today = timezone.localdate()
        etype = EquipmentType.objects.create(name="ПК", maintenance_enabled=True)
        eq = Equipment.objects.create(inventory_number="EQ-M1", equipment_type=etype)
        reg = MaintenanceRegulation.objects.create(equipment_type=etype, name="Замена фильтра", period_months=6)
        self.plan = EquipmentMaintenancePlan.objects.create(
            equipment=eq, regulation=reg, next_planned_date=self.today + timedelta(days=3)
        )

    def _run(self):
        call_command("send_maintenance_reminders")

    def test_due_soon_notifies_once_then_dedups(self):
        from accounts.models import MaintenanceReminderState

        self._run()
        state = MaintenanceReminderState.objects.get(plan_kind="equipment", plan_id=self.plan.id)
        self.assertEqual(state.notified_status, "due_soon")
        updated_at = state.updated_at
        # Повторный прогон в том же статусе — без повторного уведомления.
        self._run()
        state.refresh_from_db()
        self.assertEqual(state.updated_at, updated_at)

    def test_status_reset_when_leaving_window(self):
        from accounts.models import MaintenanceReminderState

        self._run()
        # ТО перенесено в будущее — план выходит из «подходит», отметка сбрасывается.
        self.plan.next_planned_date = self.today + timedelta(days=200)
        self.plan.save(update_fields=["next_planned_date"])
        self._run()
        state = MaintenanceReminderState.objects.get(plan_kind="equipment", plan_id=self.plan.id)
        self.assertEqual(state.notified_status, "")

    def test_overdue_notifies(self):
        from accounts.models import MaintenanceReminderState

        self.plan.next_planned_date = self.today - timedelta(days=1)
        self.plan.save(update_fields=["next_planned_date"])
        self._run()
        state = MaintenanceReminderState.objects.get(plan_kind="equipment", plan_id=self.plan.id)
        self.assertEqual(state.notified_status, "overdue")

    def test_domain_failure_is_isolated_and_logged(self):
        from core.models import BackgroundJobRun
        from core.management.commands import send_maintenance_reminders as cmd

        real_run = cmd.Command._run

        def flaky(self, domain, today):
            if domain == "equipment":
                raise RuntimeError("boom")
            return real_run(self, domain, today)

        with mock.patch.object(cmd.Command, "_run", flaky):
            self._run()  # транспорт отработал, оборудование упало — тик не оборвался
        self.assertTrue(
            BackgroundJobRun.objects.filter(job=BackgroundJobRun.Job.MAINTENANCE).exists()
        )


class MaintenancePermissionMatrixTests(APITestCase):
    """B42. Матрица прав ТО (чистые функции core.permissions): роль × флаг ×
    область типов — для оборудования и транспорта, включая отказы."""

    def _req(self, user):
        class _R:
            pass

        r = _R()
        r.user = user
        r.method = "GET"
        return r

    def test_equipment_perform_and_manage_by_role_and_flag(self):
        from accounts.models import User
        from core.permissions import (
            can_manage_maintenance,
            can_perform_maintenance,
        )

        admin = User.objects.create_user(email="p-admin@e.com", password="x", role="admin")
        maint = User.objects.create_user(email="p-maint@e.com", password="x", role="maintenance")
        acc_off = User.objects.create_user(email="p-acc0@e.com", password="x", role="accountant")
        acc_on = User.objects.create_user(
            email="p-acc1@e.com", password="x", role="accountant",
            can_maintain=True, can_manage_regulations=True,
        )
        plain = User.objects.create_user(email="p-plain@e.com", password="x", role="employee")

        self.assertTrue(can_perform_maintenance(self._req(admin)))
        self.assertTrue(can_perform_maintenance(self._req(maint)))
        self.assertFalse(can_perform_maintenance(self._req(acc_off)))
        self.assertTrue(can_perform_maintenance(self._req(acc_on)))
        self.assertFalse(can_perform_maintenance(self._req(plain)))

        # Управление регламентами: роль maintenance сюда НЕ входит.
        self.assertTrue(can_manage_maintenance(self._req(admin)))
        self.assertFalse(can_manage_maintenance(self._req(maint)))
        self.assertFalse(can_manage_maintenance(self._req(acc_off)))
        self.assertTrue(can_manage_maintenance(self._req(acc_on)))

    def test_equipment_type_scope_limits(self):
        from accounts.models import User
        from equipment.models import EquipmentType
        from core.permissions import can_maintain_type

        t1 = EquipmentType.objects.create(name="Тип1", maintenance_enabled=True)
        t2 = EquipmentType.objects.create(name="Тип2", maintenance_enabled=True)
        acc = User.objects.create_user(
            email="scope-acc@e.com", password="x", role="accountant",
            can_maintain=True, maintenance_all_types=False,
        )
        acc.maintenance_types.add(t1)
        self.assertTrue(can_maintain_type(self._req(acc), t1.id))
        self.assertFalse(can_maintain_type(self._req(acc), t2.id))

    def test_transport_perform_manage_and_scope(self):
        from accounts.models import User
        from transport.models import TransportType
        from core.permissions import (
            can_maintain_transport_type,
            can_manage_transport_maintenance,
            can_perform_transport_maintenance,
        )

        auto = User.objects.create_user(email="t-auto@e.com", password="x", role="automechanic")
        acc = User.objects.create_user(
            email="t-acc@e.com", password="x", role="accountant",
            can_maintain_transport=True, can_manage_transport_regulations=True,
            maintenance_all_transport_types=False,
        )
        self.assertTrue(can_perform_transport_maintenance(self._req(auto)))
        self.assertTrue(can_perform_transport_maintenance(self._req(acc)))
        self.assertFalse(can_manage_transport_maintenance(self._req(auto)))
        self.assertTrue(can_manage_transport_maintenance(self._req(acc)))

        tt1 = TransportType.objects.create(name="Легковой")
        tt2 = TransportType.objects.create(name="Грузовой")
        acc.maintenance_transport_types.add(tt1)
        self.assertTrue(can_maintain_transport_type(self._req(acc), tt1.id))
        self.assertFalse(can_maintain_transport_type(self._req(acc), tt2.id))


# --- B69: защитные data-миграции --------------------------------------------
import os  # noqa: E402
import tempfile  # noqa: E402
from types import SimpleNamespace  # noqa: E402

from django.test import SimpleTestCase  # noqa: E402

from core import migration_safety as ms  # noqa: E402
from core.models import BackgroundJobRun  # noqa: E402


class MigrationSafetyPureTests(SimpleTestCase):
    """Пометка/подтверждение — чистая логика без БД."""

    def test_confirmation_parsing(self):
        for val in ("1", "true", "TRUE", "yes", "on"):
            self.assertTrue(ms.confirmation_given({ms.CONFIRM_ENV: val}))
        for val in ("", "0", "false", "no", "nope"):
            self.assertFalse(ms.confirmation_given({ms.CONFIRM_ENV: val}))
        self.assertFalse(ms.confirmation_given({}))

    def test_is_and_find_destructive(self):
        marked = SimpleNamespace(app_label="x", name="0002", ele_destructive=True,
                                 ele_destructive_note="удаляет строки")
        plain = SimpleNamespace(app_label="x", name="0001")
        self.assertTrue(ms.is_destructive(marked))
        self.assertFalse(ms.is_destructive(plain))
        self.assertEqual(ms.destructive_note(marked), "удаляет строки")
        # backwards-миграции игнорируются, обычные — тоже.
        plan = [(marked, False), (plain, False), (marked, True)]
        self.assertEqual(ms.find_destructive(plan), [marked])

    def test_abort_if(self):
        with self.assertRaises(ms.DestructiveMigrationAbort):
            ms.abort_if(True, "стоп")
        ms.abort_if(False, "не должно бросить")  # без исключения


class AbortIfDuplicatesTests(APITestCase):
    def _row(self, detail):
        return BackgroundJobRun.objects.create(job="backup", status="ok", detail=detail)

    def test_raises_on_duplicates(self):
        self._row("dup")
        self._row("dup")
        self._row("unique")
        with self.assertRaises(ms.DestructiveMigrationAbort) as ctx:
            ms.abort_if_duplicates(BackgroundJobRun, "detail")
        self.assertIn("dup", str(ctx.exception))

    def test_no_raise_when_unique(self):
        self._row("a")
        self._row("b")
        ms.abort_if_duplicates(BackgroundJobRun, "detail")  # без исключения

    def test_skip_empty_ignores_blank_duplicates(self):
        self._row("")
        self._row("")
        ms.abort_if_duplicates(BackgroundJobRun, "detail", skip_empty=True)
        with self.assertRaises(ms.DestructiveMigrationAbort):
            ms.abort_if_duplicates(BackgroundJobRun, "detail", skip_empty=False)


class ArchiveRowsTests(APITestCase):
    def test_archives_before_delete_and_keeps_rows(self):
        BackgroundJobRun.objects.create(job="backup", status="ok", detail="keep-me")
        with tempfile.TemporaryDirectory() as tmp:
            with mock.patch.dict(os.environ, {"ELE_MIGRATION_ARCHIVE_DIR": tmp}):
                path = ms.archive_rows(BackgroundJobRun.objects.all(), label="core.Job")
            self.assertTrue(path and os.path.exists(path))
            with open(path, encoding="utf-8") as fh:
                self.assertIn("keep-me", fh.read())
        # archive_rows НЕ удаляет — строка на месте.
        self.assertEqual(BackgroundJobRun.objects.count(), 1)

    def test_returns_none_on_empty(self):
        self.assertIsNone(ms.archive_rows(BackgroundJobRun.objects.none(), label="empty"))


class CheckDestructiveMigrationsCommandTests(APITestCase):
    """Пре-migrate гейт. В тестовой БД все миграции применены и ни одна не
    помечена деструктивной → штатно no-op; деструктивный накат эмулируем."""

    def test_noop_when_nothing_destructive(self):
        call_command("check_destructive_migrations")  # без исключения

    def test_halts_on_unconfirmed_destructive(self):
        fake = SimpleNamespace(app_label="employees", name="0006_x",
                               ele_destructive=True, ele_destructive_note="удаляет дубли")
        with mock.patch(
            "core.management.commands.check_destructive_migrations.find_destructive",
            return_value=[fake],
        ), mock.patch.dict(os.environ, {ms.CONFIRM_ENV: ""}, clear=False):
            os.environ.pop(ms.CONFIRM_ENV, None)
            with self.assertRaises(SystemExit):
                call_command("check_destructive_migrations")

    def test_passes_when_confirmed(self):
        fake = SimpleNamespace(app_label="employees", name="0006_x",
                               ele_destructive=True, ele_destructive_note="удаляет дубли")
        with mock.patch(
            "core.management.commands.check_destructive_migrations.find_destructive",
            return_value=[fake],
        ), mock.patch.dict(os.environ, {ms.CONFIRM_ENV: "1"}):
            call_command("check_destructive_migrations")  # без исключения
