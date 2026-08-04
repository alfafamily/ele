"""B66. Журнал фоновых задач: рекордер, логика треугольника-предупреждения и
admin-эндпоинты (сводка/лента/alert)."""
from datetime import timedelta

from django.utils import timezone
from rest_framework.test import APITestCase

from accounts.models import User
from core.background_jobs import RETENTION_DAYS, record_notification_failure, record_run
from core.models import BackgroundJobRun

from .background_journal import journal_alert
from .models import Company

Job = BackgroundJobRun.Job
Status = BackgroundJobRun.Status


def _make(job, status, *, created_at=None, detail=""):
    run = BackgroundJobRun.objects.create(job=job, status=status, detail=detail)
    if created_at is not None:
        BackgroundJobRun.objects.filter(pk=run.pk).update(created_at=created_at)
        run.refresh_from_db()
    return run


class RecorderTests(APITestCase):
    def test_record_run_writes_row(self):
        record_run(Job.BACKUP, Status.OK, affected=1, detail="Создана авто-копия: x.tar.gz")
        run = BackgroundJobRun.objects.get()
        self.assertEqual(run.job, Job.BACKUP)
        self.assertEqual(run.status, Status.OK)
        self.assertEqual(run.affected, 1)

    def test_record_notification_failure(self):
        record_notification_failure("Не отправлено письмо о закреплении (SMTPException)")
        run = BackgroundJobRun.objects.get()
        self.assertEqual(run.job, Job.NOTIFICATIONS)
        self.assertEqual(run.status, Status.ERROR)

    def test_detail_truncated_to_500(self):
        record_run(Job.MAINTENANCE, Status.OK, detail="x" * 900)
        self.assertEqual(len(BackgroundJobRun.objects.get().detail), 500)

    def test_prune_removes_rows_older_than_retention(self):
        old = _make(Job.BACKUP, Status.OK, created_at=timezone.now() - timedelta(days=RETENTION_DAYS + 1))
        # Любая новая запись триггерит подчистку старых.
        record_run(Job.BACKUP, Status.OK, affected=1)
        self.assertFalse(BackgroundJobRun.objects.filter(pk=old.pk).exists())
        self.assertEqual(BackgroundJobRun.objects.count(), 1)


class AlertLogicTests(APITestCase):
    def setUp(self):
        self.company = Company.load()

    def test_no_runs_no_alert(self):
        self.assertFalse(journal_alert(self.company))

    def test_scheduled_job_last_error_alerts(self):
        _make(Job.BACKUP, Status.ERROR)
        self.assertTrue(journal_alert(self.company))

    def test_later_success_clears_alert(self):
        _make(Job.BACKUP, Status.ERROR, created_at=timezone.now() - timedelta(hours=2))
        _make(Job.BACKUP, Status.OK, created_at=timezone.now() - timedelta(hours=1))
        self.assertFalse(journal_alert(self.company))

    def test_notifications_error_only_alerts_via_window_not_scheduled(self):
        # Сбой отправки — не задача расписания: (a) не срабатывает, (b) свежий и
        # непросмотренный → треугольник горит.
        _make(Job.NOTIFICATIONS, Status.ERROR)
        self.assertTrue(journal_alert(self.company))

    def test_notifications_error_cleared_after_seen(self):
        run = _make(Job.NOTIFICATIONS, Status.ERROR)
        self.company.background_journal_seen_at = run.created_at + timedelta(seconds=1)
        self.assertFalse(journal_alert(self.company))
        # Ещё не просмотренный (метка раньше сбоя) — снова горит.
        self.company.background_journal_seen_at = run.created_at - timedelta(minutes=1)
        self.assertTrue(journal_alert(self.company))

    def test_notifications_error_older_than_24h_no_alert(self):
        _make(Job.NOTIFICATIONS, Status.ERROR, created_at=timezone.now() - timedelta(hours=25))
        self.assertFalse(journal_alert(self.company))


class EndpointTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")
        self.worker = User.objects.create_user(email="worker@example.com", password="Str0ng!Pass1")

    def test_summary_requires_admin(self):
        self.client.force_authenticate(user=self.worker)
        self.assertEqual(self.client.get("/api/company/background-journal/summary/").status_code, 403)

    def test_summary_returns_scheduled_jobs_and_marks_seen(self):
        _make(Job.BACKUP, Status.ERROR, detail="S3 недоступно")
        self.assertIsNone(Company.load().background_journal_seen_at)

        self.client.force_authenticate(user=self.admin)
        resp = self.client.get("/api/company/background-journal/summary/")
        self.assertEqual(resp.status_code, 200)
        jobs = {j["job"]: j for j in resp.data["jobs"]}
        # Все 4 задачи расписания, notifications в плитках нет.
        self.assertEqual(set(jobs), set(BackgroundJobRun.SCHEDULED_JOBS))
        self.assertEqual(jobs[Job.BACKUP]["status"], Status.ERROR)
        self.assertIsNone(jobs[Job.ANONYMIZE]["status"])  # нет прогонов → «Нет данных»

        # Открытие журнала зафиксировало «просмотрено».
        self.assertIsNotNone(Company.load().background_journal_seen_at)

    def test_events_errors_only_filter(self):
        _make(Job.BACKUP, Status.OK)
        _make(Job.BACKUP, Status.ERROR)
        self.client.force_authenticate(user=self.admin)

        all_resp = self.client.get("/api/company/background-journal/events/")
        self.assertEqual(len(all_resp.data["results"]), 2)

        err_resp = self.client.get("/api/company/background-journal/events/?errors_only=1")
        self.assertEqual(len(err_resp.data["results"]), 1)
        self.assertEqual(err_resp.data["results"][0]["status"], Status.ERROR)
        self.assertEqual(err_resp.data["results"][0]["label"], "Резервное копирование")

    def test_alert_endpoint_does_not_mark_seen(self):
        _make(Job.NOTIFICATIONS, Status.ERROR)
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get("/api/company/background-journal/alert/")
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data["alert"])
        # alert НЕ должен гасить сам себя (не отмечает просмотр).
        self.assertIsNone(Company.load().background_journal_seen_at)
