"""Назначения выгрузки полной резервной копии (B29).

Два независимых назначения:
- OWN — собственное хранилище инстанса (Local/S3, как для остальных файлов),
  через StoredFile. Из него работает скачивание копии в UI.
- SECONDARY_S3 — ОТДЕЛЬНЫЙ сторонний S3 (независимый провайдер/аккаунт), креды
  ТОЛЬКО из .env (settings.BACKUP_S3_*). Аварийная копия «на другом сервере».

Выгрузка на разные назначения независима: недоступность одного не отменяет
другое (частичный успех). Статус по каждому фиксируется вызывающим кодом
(backup/service.py) в BackupDestinationStatus.
"""
from dataclasses import dataclass

from django.conf import settings

from storage.models import StoredFile
from storage.service import store_file_stream

from .archive import ArchiveResult

OWN = "own"
SECONDARY_S3 = "secondary_s3"

_S3_PREFIX = "backups/"


@dataclass
class UploadOutcome:
    ok: bool
    error: str | None = None
    stored_file: StoredFile | None = None  # для OWN
    object_key: str | None = None  # для SECONDARY_S3
    size: int | None = None


def secondary_s3_configured() -> bool:
    return all(
        [
            settings.BACKUP_S3_ENDPOINT,
            settings.BACKUP_S3_BUCKET,
            settings.BACKUP_S3_REGION,
            settings.BACKUP_S3_ACCESS_KEY,
            settings.BACKUP_S3_SECRET_KEY,
        ]
    )


def _s3_client(*, short_timeout: bool = False):
    import boto3
    from botocore.config import Config

    # Проверка подключения — короткий таймаут (интерактив в UI). Заливка большого
    # архива — без жёсткого таймаута (может идти долго), только пара ретраев.
    if short_timeout:
        config = Config(connect_timeout=4, read_timeout=4, retries={"max_attempts": 1})
    else:
        config = Config(retries={"max_attempts": 2})
    return boto3.client(
        "s3",
        endpoint_url=settings.BACKUP_S3_ENDPOINT or None,
        region_name=settings.BACKUP_S3_REGION or None,
        aws_access_key_id=settings.BACKUP_S3_ACCESS_KEY,
        aws_secret_access_key=settings.BACKUP_S3_SECRET_KEY,
        config=config,
    )


def test_secondary_s3_connection() -> tuple[bool, str | None]:
    """head_bucket по образцу company.storage_test.test_s3_connection."""
    from botocore.exceptions import BotoCoreError, ClientError

    if not secondary_s3_configured():
        return False, "Параметры резервного S3 не заданы в .env."
    try:
        _s3_client(short_timeout=True).head_bucket(Bucket=settings.BACKUP_S3_BUCKET)
        return True, None
    except (BotoCoreError, ClientError) as exc:
        return False, f"Не удалось подключиться к резервному S3: {exc}"


# --- Выгрузка ---


def upload_own(archive: ArchiveResult) -> UploadOutcome:
    try:
        with open(archive.path, "rb") as fh:
            stored = store_file_stream(
                fh,
                archive.filename,
                "backups",
                content_type="application/octet-stream" if archive.encrypted else "application/gzip",
                size=archive.size,
                checksum=archive.checksum,
            )
        return UploadOutcome(ok=True, stored_file=stored, size=archive.size)
    except Exception as exc:  # noqa: BLE001 — показываем причину, но не валим второе назначение
        return UploadOutcome(ok=False, error=str(exc))


def upload_secondary_s3(archive: ArchiveResult) -> UploadOutcome:
    if not secondary_s3_configured():
        return UploadOutcome(ok=False, error="Резервный S3 не настроен в .env.")
    key = f"{_S3_PREFIX}{archive.filename}"
    try:
        client = _s3_client()
        with open(archive.path, "rb") as fh:
            client.upload_fileobj(fh, settings.BACKUP_S3_BUCKET, key)
        return UploadOutcome(ok=True, object_key=key, size=archive.size)
    except Exception as exc:  # noqa: BLE001
        return UploadOutcome(ok=False, error=str(exc))


def upload_to_destinations(archive: ArchiveResult, *, own: bool = True, secondary: bool = False) -> dict:
    """Заливает архив в выбранные назначения. Каждое — в своём try/except внутри
    upload_*(), частичный успех допустим. Возврат {OWN/SECONDARY_S3: UploadOutcome}."""
    outcomes: dict[str, UploadOutcome] = {}
    if own:
        outcomes[OWN] = upload_own(archive)
    if secondary:
        outcomes[SECONDARY_S3] = upload_secondary_s3(archive)
    return outcomes


def delete_secondary_s3_object(object_key: str) -> None:
    """Подчистка при обрезке по глубине хранения. Ошибки не пробрасываем —
    недоступность резервного S3 не должна блокировать подчистку своего."""
    if not (object_key and secondary_s3_configured()):
        return
    try:
        _s3_client().delete_object(Bucket=settings.BACKUP_S3_BUCKET, Key=object_key)
    except Exception:  # noqa: BLE001
        pass


# --- Восстановление из резервного S3 (для CLI restore) ---


def list_secondary_s3_backups() -> list[dict]:
    """Список объектов в backups/ резервного S3: [{key, filename, size,
    last_modified}], новые сверху. Для интерактивного выбора в restore_backup."""
    client = _s3_client()
    paginator = client.get_paginator("list_objects_v2")
    items: list[dict] = []
    for page in paginator.paginate(Bucket=settings.BACKUP_S3_BUCKET, Prefix=_S3_PREFIX):
        for obj in page.get("Contents", []):
            key = obj["Key"]
            if key.endswith("/"):
                continue
            items.append(
                {
                    "key": key,
                    "filename": key[len(_S3_PREFIX):] if key.startswith(_S3_PREFIX) else key,
                    "size": obj.get("Size", 0),
                    "last_modified": obj.get("LastModified"),
                }
            )
    items.sort(key=lambda it: it["last_modified"] or 0, reverse=True)
    return items


def download_secondary_s3(object_key: str, dst_path: str) -> None:
    client = _s3_client()
    key = object_key if object_key.startswith(_S3_PREFIX) else f"{_S3_PREFIX}{object_key}"
    with open(dst_path, "wb") as fh:
        client.download_fileobj(settings.BACKUP_S3_BUCKET, key, fh)
