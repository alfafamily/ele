"""B44. Генерация пары VAPID-ключей для Web Push.

Печатает готовые строки для .env: VAPID_PRIVATE_KEY (base64url raw-32, читается
pywebpush/py-vapid) и VAPID_PUBLIC_KEY (base64url uncompressed point —
applicationServerKey для браузера). Backend в .env не пишет — значения
администратор вставляет вручную.
"""
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from django.core.management.base import BaseCommand
from py_vapid import Vapid
from py_vapid.utils import b64urlencode


def _b64(raw: bytes) -> str:
    # b64urlencode в разных версиях py-vapid возвращает str или bytes.
    encoded = b64urlencode(raw)
    return encoded.decode() if isinstance(encoded, bytes) else encoded


class Command(BaseCommand):
    help = "Сгенерировать пару VAPID-ключей для Web Push (для вставки в .env)."

    def handle(self, *args, **options):
        vapid = Vapid()
        vapid.generate_keys()

        private_raw = vapid.private_key.private_numbers().private_value.to_bytes(32, "big")
        private_b64 = _b64(private_raw)

        public_raw = vapid.public_key.public_bytes(Encoding.X962, PublicFormat.UncompressedPoint)
        public_b64 = _b64(public_raw)

        self.stdout.write("Добавьте в .env (backend их не записывает):\n")
        self.stdout.write(f"VAPID_PRIVATE_KEY={private_b64}")
        self.stdout.write(f"VAPID_PUBLIC_KEY={public_b64}")
