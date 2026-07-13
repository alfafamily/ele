import hashlib

from django.core.files.base import ContentFile
from django.utils.crypto import get_random_string

from .backends import get_backend, target_backend_name
from .models import StoredFile


def store_uploaded_file(file_obj, subdir: str) -> StoredFile:
    """Сохраняет файл в ТЕКУЩЕЕ целевое хранилище компании и создаёт
    StoredFile. Единственная точка входа для новых загрузок — вызывающий код
    (equipment/licenses/employees/company) не работает с backend'ами напрямую."""
    backend_name = target_backend_name()
    backend = get_backend(backend_name)

    ext = file_obj.name.rsplit(".", 1)[-1] if "." in file_obj.name else ""
    random_name = get_random_string(24)
    path = f"{subdir}/{random_name}.{ext}" if ext else f"{subdir}/{random_name}"

    hasher = hashlib.sha256()
    for chunk in file_obj.chunks():
        hasher.update(chunk)
    file_obj.seek(0)

    saved_path = backend.save(path, file_obj)
    return StoredFile.objects.create(
        backend=backend_name,
        path=saved_path,
        original_filename=file_obj.name,
        content_type=getattr(file_obj, "content_type", "") or "",
        size=file_obj.size,
        checksum=hasher.hexdigest(),
    )


def store_bytes(content: bytes, filename: str, subdir: str, content_type: str = "") -> StoredFile:
    """Как store_uploaded_file(), но для программно сгенерированного
    содержимого (резервные копии — backup/service.py), а не файла из формы."""
    backend_name = target_backend_name()
    backend = get_backend(backend_name)

    ext = filename.rsplit(".", 1)[-1] if "." in filename else ""
    random_name = get_random_string(24)
    path = f"{subdir}/{random_name}.{ext}" if ext else f"{subdir}/{random_name}"

    saved_path = backend.save(path, ContentFile(content))
    return StoredFile.objects.create(
        backend=backend_name,
        path=saved_path,
        original_filename=filename,
        content_type=content_type,
        size=len(content),
        checksum=hashlib.sha256(content).hexdigest(),
    )


def delete_stored_file(stored_file: StoredFile | None) -> None:
    if stored_file is None:
        return
    get_backend(stored_file.backend).delete(stored_file.path)
    stored_file.delete()
