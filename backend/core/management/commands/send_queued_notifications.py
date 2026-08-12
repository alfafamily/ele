"""Слив очереди отложенных уведомлений (окно отправки уведомлений).

Событие, случившееся вне окна отправки компании (Company.notify_window_*),
не шлётся сразу, а кладётся в accounts.QueuedNotification на ближайшее открытие
окна. Эта команда запускается из того же cron-цикла (раз в минуту) и внутри
окна отправляет все «созревшие» записи (scheduled_for <= сейчас), затем удаляет
их. Доставка «выстрелил и забыл» (без повторных попыток) — как у синхронной
отправки: send_to_user/send_notification_email сами гасят сбои сети/почты и
сигнализируют в журнал фоновых задач.

Вне окна команда — noop: записи ждут (их scheduled_for уже наступил, но окно
закрыто), и уйдут на следующем тике после открытия окна.
"""
import logging

from django.core.management.base import BaseCommand
from django.utils import timezone

logger = logging.getLogger(__name__)

# Потолок на один тик — очень длинная очередь не должна держать цикл cron; хвост
# уйдёт на следующих тиках (они идут раз в минуту).
_BATCH = 500


class Command(BaseCommand):
    help = "Отправить созревшие отложенные уведомления (в окне отправки компании)."

    def handle(self, *args, **options):
        from accounts.emails import send_notification_email
        from accounts.models import QueuedNotification
        from accounts.notify_window import within_window
        from accounts.push import send_to_user
        from core.background_jobs import record_run
        from core.models import BackgroundJobRun

        if not within_window():
            return  # окно закрыто — ждём открытия

        due = list(
            QueuedNotification.objects.filter(scheduled_for__lte=timezone.now())
            .select_related("user")[:_BATCH]
        )
        sent = 0
        for q in due:
            try:
                if q.channel == QueuedNotification.Channel.PUSH:
                    send_to_user(q.user, q.payload or {})
                elif q.user.email:
                    p = q.payload or {}
                    send_notification_email(
                        p.get("email_kind", ""), p.get("template", ""),
                        [q.user.email], p.get("context") or {},
                    )
                sent += 1
            except Exception:  # noqa: BLE001 — одна запись не должна ронять слив очереди
                logger.exception("Сбой слива отложенного уведомления id=%s", q.id)
            finally:
                # Доставка без повторов: удаляем после попытки (как синхронная отправка).
                q.delete()

        self.stdout.write(f"Отправлено отложенных уведомлений: {sent}")
        if sent:
            record_run(
                BackgroundJobRun.Job.NOTIFICATIONS,
                BackgroundJobRun.Status.OK,
                affected=sent,
                detail=f"Отправлено отложенных уведомлений: {sent}",
            )
