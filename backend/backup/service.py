"""Оркестрация создания полной резервной копии (B29): собрать архив
(БД + файлы, опц. шифрование) → выгрузить в назначения (своё хранилище и/или
резервный S3) → зафиксировать запись со статусом по каждому назначению."""
import os

from django.conf import settings
from django.utils import timezone

from storage.service import delete_stored_file

from .archive import build_archive
from .destinations import (
    SECONDARY_S3,
    delete_secondary_s3_object,
    upload_own,
    upload_secondary_s3,
)
from .models import BackupDestinationStatus, BackupRecord


def create_backup(
    backup_type: str,
    *,
    passphrase: str | None = None,
    destination: str | None = None,
) -> BackupRecord:
    """Собирает полную копию и выгружает её в ОДНО назначение (хранилище
    приложения или отдельный резервный S3). Запись создаётся всегда — статус
    назначения (в т.ч. ошибка) фиксируется в BackupDestinationStatus."""
    from company.models import Company

    company = Company.load()
    if destination is None:
        destination = (
            company.auto_backup_destination
            if backup_type == BackupRecord.BackupType.AUTO
            else BackupDestinationStatus.Destination.OWN
        )
    # Авто-копии идут headless (cron) — ад-хок пароль передать неоткуда,
    # берём его из окружения (пусто = без шифрования).
    if passphrase is None and backup_type == BackupRecord.BackupType.AUTO:
        passphrase = settings.BACKUP_PASSPHRASE or None

    archive = build_archive(passphrase)
    try:
        if destination == SECONDARY_S3:
            outcome = upload_secondary_s3(archive)
        else:
            outcome = upload_own(archive)
    finally:
        if os.path.exists(archive.path):
            os.remove(archive.path)

    record = BackupRecord.objects.create(
        backup_type=backup_type,
        format=BackupRecord.Format.V2_ARCHIVE,
        encrypted=archive.encrypted,
        filename=archive.filename,
        size=archive.size,
        checksum=archive.checksum,
        app_version=archive.manifest.get("app_version", ""),
        file=outcome.stored_file if outcome.ok else None,
    )
    BackupDestinationStatus.objects.create(
        backup=record,
        destination=destination,
        ok=outcome.ok,
        error=outcome.error or "",
        object_key=outcome.object_key or "",
        stored_file=outcome.stored_file,
        size=outcome.size or 0,
    )
    return record


def backup_fully_failed(record: BackupRecord) -> bool:
    """Назначение не удалось — вызывающий view может вернуть 502."""
    return not record.destinations.filter(ok=True).exists()


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
    _trim_auto_backups(company)
    return record


def _trim_auto_backups(company) -> None:
    """Обрезка авто-копий по единой глубине хранения (auto_backup_retention),
    независимо от назначения. У копии одно назначение — удаляем его артефакт
    (StoredFile или объект резервного S3) и саму запись."""
    keep = company.auto_backup_retention
    autos = list(BackupRecord.objects.filter(backup_type=BackupRecord.BackupType.AUTO).order_by("-created_at"))
    for record in autos[keep:]:
        for dest in record.destinations.all():
            if dest.destination == SECONDARY_S3 and dest.object_key:
                delete_secondary_s3_object(dest.object_key)
        if record.file_id:
            # file FK — CASCADE: удаление StoredFile снесёт и запись со статусами.
            delete_stored_file(record.file)
        else:
            record.delete()
