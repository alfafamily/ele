"""Оркестрация создания полной резервной копии (B29): собрать архив
(БД + файлы, опц. шифрование) → выгрузить в назначения (своё хранилище и/или
резервный S3) → зафиксировать запись со статусом по каждому назначению."""
import os

from django.conf import settings
from django.utils import timezone

from storage.service import delete_stored_file

from .archive import build_archive
from .destinations import (
    OWN,
    SECONDARY_S3,
    delete_secondary_s3_object,
    secondary_s3_configured,
    upload_to_destinations,
)
from .models import BackupDestinationStatus, BackupRecord


def create_backup(
    backup_type: str,
    *,
    passphrase: str | None = None,
    to_secondary: bool | None = None,
) -> BackupRecord:
    """Собирает полную копию и выгружает её. Частичный успех допустим: запись
    создаётся всегда (для видимости в UI), статус по каждому назначению — в
    BackupDestinationStatus."""
    from company.models import Company

    company = Company.load()
    if to_secondary is None:
        to_secondary = company.backup_secondary_s3_enabled and secondary_s3_configured()
    # Авто-копии идут headless (cron) — ад-хок пароль передать неоткуда,
    # берём его из окружения (пусто = без шифрования).
    if passphrase is None and backup_type == BackupRecord.BackupType.AUTO:
        passphrase = settings.BACKUP_PASSPHRASE or None

    archive = build_archive(passphrase)
    try:
        outcomes = upload_to_destinations(archive, own=True, secondary=to_secondary)
    finally:
        if os.path.exists(archive.path):
            os.remove(archive.path)

    own_outcome = outcomes.get(OWN)
    record = BackupRecord.objects.create(
        backup_type=backup_type,
        format=BackupRecord.Format.V2_ARCHIVE,
        encrypted=archive.encrypted,
        filename=archive.filename,
        size=archive.size,
        checksum=archive.checksum,
        app_version=archive.manifest.get("app_version", ""),
        file=own_outcome.stored_file if own_outcome and own_outcome.ok else None,
    )
    for dest, outcome in outcomes.items():
        BackupDestinationStatus.objects.create(
            backup=record,
            destination=dest,
            ok=outcome.ok,
            error=outcome.error or "",
            object_key=outcome.object_key or "",
            stored_file=outcome.stored_file,
            size=outcome.size or 0,
        )
    return record


def backup_fully_failed(record: BackupRecord) -> bool:
    """Ни одно назначение не удалось — вызывающий view может вернуть 502."""
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


def _delete_own_copy(record: BackupRecord) -> None:
    """Убирает собственную копию, СОХРАНЯЯ запись (у неё может остаться копия на
    резервном S3). Сначала отвязываем StoredFile (file FK — CASCADE, иначе
    удаление файла снесло бы саму запись), потом удаляем файл и own-статус."""
    stored_file = record.file
    if stored_file is not None:
        record.file = None
        record.save(update_fields=["file"])
        delete_stored_file(stored_file)
    record.destinations.filter(destination=OWN).delete()


def _trim_auto_backups(company) -> None:
    """Обрезка авто-копий по глубине хранения — раздельно по назначениям:
    свои копии по auto_backup_retention, резервный S3 — по
    backup_secondary_s3_retention. Запись удаляется, только когда у неё не
    осталось ни одного назначения."""
    own_keep = company.auto_backup_retention
    secondary_keep = company.backup_secondary_s3_retention
    # Без prefetch: далее мы удаляем статусы, и кешированный prefetch сделал бы
    # проверку «остались ли назначения» устаревшей.
    autos = list(BackupRecord.objects.filter(backup_type=BackupRecord.BackupType.AUTO).order_by("-created_at"))
    for i, record in enumerate(autos):
        dests = {d.destination: d for d in record.destinations.all()}
        if i >= own_keep and OWN in dests:
            _delete_own_copy(record)
        if i >= secondary_keep and SECONDARY_S3 in dests:
            delete_secondary_s3_object(dests[SECONDARY_S3].object_key)
            dests[SECONDARY_S3].delete()
        if not BackupDestinationStatus.objects.filter(backup=record).exists():
            record.delete()
