"""Живой тест подключения к S3 для Setup Wizard (ТЗ §4.1 шаг 3) — только
проверка, ничего не сохраняет. Реализация полноценного S3-backend — Фаза 5."""
import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

# Короткий таймаут и без ретраев — это интерактивная проверка в мастере
# настройки, зависание на недоступном хосте недопустимо.
_BOTO_CONFIG = Config(connect_timeout=4, read_timeout=4, retries={"max_attempts": 1})


def storage_selftest() -> tuple[bool, str | None]:
    """Проверка активного хранилища (§8.3): запись → чтение → удаление
    тестового файла test_file.txt. Работает и для local, и для s3 через общий
    интерфейс бэкенда; за собой всегда прибирает."""
    from django.core.files.base import ContentFile

    from storage.backends import get_backend, target_backend_name

    backend = get_backend(target_backend_name())
    content = "Тестовый файл"
    saved = None
    try:
        saved = backend.save("test_file.txt", ContentFile(content.encode("utf-8")))
        with backend.open(saved) as fh:
            read_back = fh.read()
        if isinstance(read_back, bytes):
            read_back = read_back.decode("utf-8")
        if read_back != content:
            return False, "Файл записан, но прочитан с искажением."
        return True, None
    except Exception as exc:  # noqa: BLE001 — любую ошибку показываем админу как текст
        return False, f"Ошибка хранилища: {exc}"
    finally:
        if saved:
            try:
                backend.delete(saved)
            except Exception:  # noqa: BLE001
                pass


def test_s3_connection(data: dict) -> tuple[bool, str | None]:
    try:
        client = boto3.client(
            "s3",
            endpoint_url=data["endpoint"],
            region_name=data["region"] or None,
            aws_access_key_id=data["access_key"],
            aws_secret_access_key=data["secret_key"],
            config=_BOTO_CONFIG,
        )
        client.head_bucket(Bucket=data["bucket"])
        return True, None
    except (BotoCoreError, ClientError) as exc:
        return False, f"Не удалось подключиться к S3: {exc}"
