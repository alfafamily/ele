"""Свободное место по хранилищам (B33).

Индикация в «Настройки → Системные» и жёлтый треугольник на иконке Настроек:
- Хранилище приложения (Local) — свободно/всего по разделу диска (shutil.disk_usage);
- Хранилище приложения (S3) — занято = сумма StoredFile.size (backend=s3) из БД;
  «свободно» = квота (settings.S3_QUOTA_GB) − занято, если квота задана;
- Резервный S3 (backup) — занято = сумма объектов backups/; «свободно» = квота
  (settings.BACKUP_S3_QUOTA_GB) − занято, если квота задана.

У S3 нет понятия «свободного места», поэтому лимит задаёт администратор в .env.
Без лимита показываем только занятый объём и НЕ выводим предупреждение.

Опрос S3 (list_objects_v2 по backups/) кэшируется в процессе на 5 минут —
чтобы не дёргать провайдера на каждый рендер меню/открытие Настроек.
"""
import shutil
import time

from django.conf import settings
from django.db.models import Sum

# Порог предупреждения о нехватке места. Ниже него подсвечиваем хранилище и
# показываем треугольник на иконке Настроек.
STORAGE_LOW_THRESHOLD_BYTES = 500 * 1024 * 1024  # 500 МБ

_GB = 1024 * 1024 * 1024

# TTL-кэш занятого объёма резервного S3 (обход бакета — дорогой сетевой вызов).
_S3_USED_TTL = 300  # 5 минут
_s3_used_cache: dict[str, tuple[float, int]] = {}


def _quota_bytes(gb: float) -> int | None:
    """ГБ из .env (допускается дробное) → байты; 0/пусто → None («не задан»)."""
    return int(gb * _GB) if gb else None


def _low(free_bytes: int | None) -> bool:
    """Предупреждаем только там, где «свободно» вообще известно (Local всегда;
    S3 — лишь при заданной квоте)."""
    return free_bytes is not None and free_bytes < STORAGE_LOW_THRESHOLD_BYTES


def _cached_s3_used(key: str, fn) -> int:
    now = time.time()
    hit = _s3_used_cache.get(key)
    if hit and now - hit[0] < _S3_USED_TTL:
        return hit[1]
    value = fn()
    _s3_used_cache[key] = (now, value)
    return value


def _local_disk_space() -> dict:
    # MEDIA_ROOT может ещё не существовать на свежей установке — тогда меряем
    # ближайший существующий родительский каталог (тот же раздел диска).
    path = settings.MEDIA_ROOT
    while not path.exists() and path != path.parent:
        path = path.parent
    usage = shutil.disk_usage(str(path))
    return {
        "kind": "local",
        "total_bytes": usage.total,
        "free_bytes": usage.free,
        "used_bytes": usage.total - usage.free,
        "low": _low(usage.free),
    }


def _stored_used_bytes(backend: str) -> int:
    from .models import StoredFile

    return StoredFile.objects.filter(backend=backend).aggregate(s=Sum("size"))["s"] or 0


def _s3_space(*, used_bytes: int, quota_gb: int) -> dict:
    quota = _quota_bytes(quota_gb)
    free = max(quota - used_bytes, 0) if quota is not None else None
    return {
        "kind": "s3",
        "used_bytes": used_bytes,
        "quota_bytes": quota,
        "free_bytes": free,
        "low": _low(free),
    }


def app_storage_space() -> dict:
    """Свободное место хранилища приложения (по текущему режиму компании)."""
    from company.models import Company

    if Company.load().storage_mode == Company.StorageMode.S3:
        used = _cached_s3_used("app", lambda: _stored_used_bytes("s3"))
        return _s3_space(used_bytes=used, quota_gb=settings.S3_QUOTA_GB)
    return _local_disk_space()


def backup_s3_space() -> dict | None:
    """Свободное место резервного S3. None, если backup-S3 не настроен в .env
    (в UI строку тогда не показываем — вариант всё равно недоступен)."""
    from backup.destinations import list_secondary_s3_backups, secondary_s3_configured

    if not secondary_s3_configured():
        return None
    used = _cached_s3_used(
        "backup",
        lambda: sum(item["size"] for item in list_secondary_s3_backups()),
    )
    return _s3_space(used_bytes=used, quota_gb=settings.BACKUP_S3_QUOTA_GB)


def storage_space_report() -> dict:
    """Единый отчёт для эндпоинта: место по каждому хранилищу + сводный флаг low
    (для треугольника на иконке Настроек)."""
    app = app_storage_space()
    backup = backup_s3_space()
    return {
        "threshold_bytes": STORAGE_LOW_THRESHOLD_BYTES,
        "app": app,
        "backup_s3": backup,
        "low": bool(app.get("low")) or bool(backup and backup.get("low")),
    }
