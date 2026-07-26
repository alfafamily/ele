"""Сборка ПОЛНОЙ резервной копии (B29) в единый архив и опциональное
шифрование.

Архив — tar.gz со структурой:
    db.json                     — полный dumpdata (export.dump_database)
    manifest.json               — версия формата/схемы/приложения + перечень файлов
    files/<stored_file_pk>.bin  — бинарники всех StoredFile

Всё пишется ПОТОКОВО через временные файлы на диске — ни дамп, ни файлы, ни
итоговый архив не держатся в памяти целиком (копии могут быть большими).

Шифрование (если задана парольная фраза) — AES-256-GCM, ключ из PBKDF2-HMAC-SHA256.
Контейнер: magic | salt(16) | nonce(12) | ciphertext | tag(16). GCM аутентифицирует
данные, поэтому неверный пароль или повреждение архива детектируются при расшифровке.
"""
import hashlib
import json
import os
import shutil
import tarfile
import tempfile
from dataclasses import dataclass

from django.utils import timezone

from storage.backends import get_backend
from storage.models import StoredFile

from .export import BACKUP_SUBDIR, build_manifest, dump_database

_CHUNK = 1024 * 1024  # 1 MiB — единый размер чтения/шифрования потоком

# Формат контейнера шифрования (первые байты файла .enc).
_ENC_MAGIC = b"ELEBAK1\n"
_SALT_LEN = 16
_NONCE_LEN = 12
_TAG_LEN = 16
_PBKDF2_ITERATIONS = 200_000


@dataclass
class ArchiveResult:
    path: str  # путь к готовому временному файлу (архиву, возможно зашифрованному)
    filename: str  # желаемое имя для хранилища/скачивания
    size: int  # размер итогового артефакта
    checksum: str  # sha256 итогового артефакта (после шифрования, если было)
    encrypted: bool
    manifest: dict


def _sha256_file(path: str) -> str:
    hasher = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(_CHUNK), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def _spool_stored_file(backend, sf: StoredFile):
    """Скачивает бинарник StoredFile во временный файл, попутно считая размер и
    sha256. Возврат (temp_path, size, checksum). Так tarfile получает точный
    размер (не полагаемся на возможно расходящийся sf.size) и не рвёт архив."""
    tmp = tempfile.NamedTemporaryFile(delete=False)
    hasher = hashlib.sha256()
    size = 0
    try:
        with backend.open(sf.path) as src:
            for chunk in iter(lambda: src.read(_CHUNK), b""):
                tmp.write(chunk)
                hasher.update(chunk)
                size += len(chunk)
    finally:
        tmp.close()
    return tmp.name, size, hasher.hexdigest()


def build_archive(passphrase: str | None = None) -> ArchiveResult:
    """Собирает полную копию (БД + файлы + manifest) во временный файл.
    Вызывающий обязан удалить ArchiveResult.path после использования."""
    stamp = timezone.now().strftime("%Y%m%d-%H%M%S")
    db_tmp = None
    tar_tmp = None
    enc_tmp = None
    try:
        # 1. Полный дамп БД в отдельный временный файл.
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", suffix=".json", delete=False) as f:
            db_tmp = f.name
            dump_database(f)
        db_bytes = os.path.getsize(db_tmp)

        # 2. Собираем tar.gz: db.json + files/* + manifest.json (последним).
        tar_fd, tar_tmp = tempfile.mkstemp(suffix=".tar.gz")
        os.close(tar_fd)
        files_meta: list[dict] = []
        with tarfile.open(tar_tmp, "w:gz") as tar:
            tar.add(db_tmp, arcname="db.json")

            # Исключаем сами архивы прошлых копий (подкаталог backups/) — иначе
            # каждая новая копия вбирала бы все предыдущие.
            stored_qs = StoredFile.objects.exclude(path__startswith=f"{BACKUP_SUBDIR}/").iterator()
            for sf in stored_qs:
                arcname = f"files/{sf.pk}.bin"
                entry = {
                    "pk": sf.pk,
                    "backend": sf.backend,
                    "path": sf.path,
                    "size": sf.size,
                    "checksum": sf.checksum,
                    "arcname": arcname,
                }
                backend = get_backend(sf.backend)
                spool_path = None
                try:
                    spool_path, real_size, real_checksum = _spool_stored_file(backend, sf)
                    entry["size"] = real_size
                    entry["checksum"] = real_checksum
                    tar.add(spool_path, arcname=arcname)
                except Exception as exc:  # noqa: BLE001 — файл мог пропасть из хранилища
                    # Не валим весь бэкап: помечаем файл отсутствующим, продолжаем.
                    entry["missing"] = True
                    entry["error"] = str(exc)
                finally:
                    if spool_path and os.path.exists(spool_path):
                        os.remove(spool_path)
                files_meta.append(entry)

            manifest = build_manifest(db_bytes=db_bytes, files_meta=files_meta, encrypted=bool(passphrase))
            manifest_bytes = json.dumps(manifest, ensure_ascii=False, indent=2).encode("utf-8")
            with tempfile.NamedTemporaryFile(delete=False) as mf:
                manifest_tmp = mf.name
                mf.write(manifest_bytes)
            try:
                tar.add(manifest_tmp, arcname="manifest.json")
            finally:
                os.remove(manifest_tmp)

        # 3. Опциональное шифрование итогового архива.
        if passphrase:
            enc_fd, enc_tmp = tempfile.mkstemp(suffix=".tar.gz.enc")
            os.close(enc_fd)
            encrypt_file(tar_tmp, enc_tmp, passphrase)
            os.remove(tar_tmp)
            tar_tmp = None
            artifact_path = enc_tmp
            enc_tmp = None  # передаём владение вызывающему
            filename = f"ele-backup-{stamp}.tar.gz.enc"
        else:
            artifact_path = tar_tmp
            tar_tmp = None  # передаём владение вызывающему
            filename = f"ele-backup-{stamp}.tar.gz"

        return ArchiveResult(
            path=artifact_path,
            filename=filename,
            size=os.path.getsize(artifact_path),
            checksum=_sha256_file(artifact_path),
            encrypted=bool(passphrase),
            manifest=manifest,
        )
    finally:
        # Чистим только промежуточные временные файлы; итоговый artifact_path
        # выше «обнулён» (tar_tmp/enc_tmp = None), поэтому не удаляется.
        for tmp in (db_tmp, tar_tmp, enc_tmp):
            if tmp and os.path.exists(tmp):
                os.remove(tmp)


# --- Шифрование (AES-256-GCM, потоково) ---


def _derive_key(passphrase: str, salt: bytes) -> bytes:
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=_PBKDF2_ITERATIONS)
    return kdf.derive(passphrase.encode("utf-8"))


def encrypt_file(src_path: str, dst_path: str, passphrase: str) -> None:
    from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

    salt = os.urandom(_SALT_LEN)
    nonce = os.urandom(_NONCE_LEN)
    key = _derive_key(passphrase, salt)
    encryptor = Cipher(algorithms.AES(key), modes.GCM(nonce)).encryptor()
    with open(src_path, "rb") as src, open(dst_path, "wb") as dst:
        dst.write(_ENC_MAGIC)
        dst.write(salt)
        dst.write(nonce)
        for chunk in iter(lambda: src.read(_CHUNK), b""):
            dst.write(encryptor.update(chunk))
        dst.write(encryptor.finalize())
        dst.write(encryptor.tag)  # 16 байт GCM-тега в конце


def is_encrypted(path: str) -> bool:
    try:
        with open(path, "rb") as fh:
            return fh.read(len(_ENC_MAGIC)) == _ENC_MAGIC
    except OSError:
        return False


def decrypt_file(src_path: str, dst_path: str, passphrase: str) -> None:
    """Расшифровывает контейнер обратно в tar.gz. Неверный пароль или
    повреждение → cryptography.exceptions.InvalidTag на finalize()."""
    from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

    header_len = len(_ENC_MAGIC) + _SALT_LEN + _NONCE_LEN
    total = os.path.getsize(src_path)
    ct_len = total - header_len - _TAG_LEN
    if ct_len < 0:
        raise ValueError("Файл слишком мал для зашифрованного архива.")
    with open(src_path, "rb") as src:
        magic = src.read(len(_ENC_MAGIC))
        if magic != _ENC_MAGIC:
            raise ValueError("Неверный формат зашифрованного архива.")
        salt = src.read(_SALT_LEN)
        nonce = src.read(_NONCE_LEN)
        # Тег GCM лежит в самом конце — читаем его отдельно, не сдвигая курсор ct.
        src.seek(total - _TAG_LEN)
        tag = src.read(_TAG_LEN)
        src.seek(header_len)

        key = _derive_key(passphrase, salt)
        decryptor = Cipher(algorithms.AES(key), modes.GCM(nonce, tag)).decryptor()
        remaining = ct_len
        with open(dst_path, "wb") as dst:
            while remaining > 0:
                chunk = src.read(min(_CHUNK, remaining))
                if not chunk:
                    break
                remaining -= len(chunk)
                dst.write(decryptor.update(chunk))
            dst.write(decryptor.finalize())  # InvalidTag при неверном пароле/повреждении


def sha256_file(path: str) -> str:
    """Публичная обёртка над потоковым sha256 (используется restore для
    сверки распакованных файлов с manifest)."""
    return _sha256_file(path)


def extract_member_to(tar: tarfile.TarFile, arcname: str, dst_path: str) -> None:
    """Извлекает один член архива в конкретный путь потоково."""
    member = tar.getmember(arcname)
    src = tar.extractfile(member)
    if src is None:
        raise KeyError(arcname)
    with open(dst_path, "wb") as dst:
        shutil.copyfileobj(src, dst, _CHUNK)
