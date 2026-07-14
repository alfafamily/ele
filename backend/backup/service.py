import json

from django.utils import timezone

from storage.service import delete_stored_file, store_bytes

from .export import build_backup_data
from .models import BackupRecord


def create_backup(backup_type: str) -> BackupRecord:
    data = build_backup_data()
    content = json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8")
    filename = f"ele-backup-{timezone.now():%Y%m%d-%H%M%S}.json"
    stored_file = store_bytes(content, filename, "backups", content_type="application/json")
    return BackupRecord.objects.create(backup_type=backup_type, file=stored_file)


def run_scheduled_backup_if_due() -> BackupRecord | None:
    """Вызывается каждый тик cron (расписание + глубина хранения).
    Не более одной авто-копии в календарные сутки, начиная с заданного часа."""
    from company.models import Company

    company = Company.load()
    if not company.auto_backup_enabled:
        return None

    now = timezone.localtime()
    last_auto = BackupRecord.objects.filter(backup_type=BackupRecord.BackupType.AUTO).order_by("-created_at").first()
    if last_auto and timezone.localtime(last_auto.created_at).date() == now.date():
        return None
    if now.time() < company.auto_backup_time:
        return None

    record = create_backup(BackupRecord.BackupType.AUTO)
    _trim_auto_backups(company.auto_backup_retention)
    return record


def _trim_auto_backups(retention: int) -> None:
    # list() перед срезом — при ≤30 копиях дешевле, чем гадать про open-ended
    # slice поддержку у QuerySet.
    auto_backups = list(BackupRecord.objects.filter(backup_type=BackupRecord.BackupType.AUTO).order_by("-created_at"))
    for record in auto_backups[retention:]:
        delete_stored_file(record.file)
        record.delete()
