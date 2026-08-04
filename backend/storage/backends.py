"""Абстракция Local/S3 — бизнес-логика работает через StoredFile
и get_backend(), никогда не собирает пути к файлам напрямую."""
from django.conf import settings
from django.core.files.storage import FileSystemStorage


class StorageBackend:
    """Базовый делегирующий backend. Все операции проксируются в django-стораж
    `self._storage`, который подкласс обязан установить в __init__. Подклассы
    задают только `name` и способ создания `self._storage`."""

    name: str
    _storage = None

    def save(self, path: str, file_obj) -> str:
        return self._storage.save(path, file_obj)

    def open(self, path: str):
        return self._storage.open(path)

    def delete(self, path: str) -> None:
        if self._storage.exists(path):
            self._storage.delete(path)

    def exists(self, path: str) -> bool:
        return self._storage.exists(path)

    def url(self, path: str) -> str:
        return self._storage.url(path)


class LocalStorageBackend(StorageBackend):
    name = "local"

    def __init__(self):
        self._storage = FileSystemStorage(location=str(settings.MEDIA_ROOT), base_url=settings.MEDIA_URL)


class S3StorageBackend(StorageBackend):
    name = "s3"

    def __init__(self):
        from botocore.config import Config
        from storages.backends.s3 import S3Storage

        # B56-R1 (#8): без явного config botocore держит воркер до дефолтных
        # 60/60 c при зависшем/недоступном S3. Значения задаются в .env
        # (S3_CONNECT_TIMEOUT/S3_READ_TIMEOUT), дефолты 5/60 c — см. settings.
        # connect_timeout режем агрессивно (установка соединения быстрая).
        # read_timeout — это лимит НА ОДНУ socket-операцию (ожидание ответа/чтение
        # чанка), а не на весь перенос, поэтому легитимную большую загрузку
        # (вплоть до Company.max_upload_mb) он не обрывает: multipart-запись идёт
        # частями. Retries оставляем дефолтными (в отличие от разовой проверки
        # соединения в backup/company, где стоит max_attempts=1).
        client_config = Config(
            connect_timeout=settings.S3_CONNECT_TIMEOUT,
            read_timeout=settings.S3_READ_TIMEOUT,
        )

        self._storage = S3Storage(
            bucket_name=settings.S3_BUCKET,
            endpoint_url=settings.S3_ENDPOINT or None,
            region_name=settings.S3_REGION or None,
            access_key=settings.S3_ACCESS_KEY,
            secret_key=settings.S3_SECRET_KEY,
            client_config=client_config,
        )


_INSTANCES: dict[str, StorageBackend] = {}


def get_backend(name: str) -> StorageBackend:
    if name not in _INSTANCES:
        if name == "local":
            _INSTANCES[name] = LocalStorageBackend()
        elif name == "s3":
            _INSTANCES[name] = S3StorageBackend()
        else:
            raise ValueError(f"Неизвестное хранилище: {name}")
    return _INSTANCES[name]


def target_backend_name() -> str:
    """Текущий целевой backend компании — читается заново на каждой загрузке,
    поэтому файлы, загруженные во время активной миграции, сразу попадают
    в новое хранилище, без ожидания завершения переноса старых."""
    from company.models import Company

    return Company.load().storage_mode
