"""Живой тест подключения к S3 для Setup Wizard (ТЗ §4.1 шаг 3) — только
проверка, ничего не сохраняет. Реализация полноценного S3-backend — Фаза 5."""
import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

# Короткий таймаут и без ретраев — это интерактивная проверка в мастере
# настройки, зависание на недоступном хосте недопустимо.
_BOTO_CONFIG = Config(connect_timeout=4, read_timeout=4, retries={"max_attempts": 1})


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
