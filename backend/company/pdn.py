"""B51-R2. Документы по обработке ПДн: скачивание по ссылке, хранение локальной
копии, ведение текущей версии каждого вида.

Оператор задаёт документ ссылкой или файлом; в обоих случаях храним ЛОКАЛЬНУЮ
копию (StoredFile). При вводе ссылки файл скачивается по ней с проверками:
ответ 200, это именно файл (не HTML-страница), разумный размер. Недоступную
ссылку или веб-страницу сохранить нельзя (решение пользователя, B51-R2).
"""

import ipaddress
import socket
from urllib.parse import urlparse

import requests
from django.db import transaction

from storage.service import store_bytes, store_uploaded_file

from .models import Company, PdnDocument

# Ограничение размера скачиваемого документа берём из настройки загрузок компании.
_DOWNLOAD_TIMEOUT = 15  # сек
_HTML_SNIFF = (b"<!doctype html", b"<html")


class PdnDocumentError(Exception):
    """Понятная ошибка для ответа API (сообщение показывается оператору)."""


def _guard_public_url(url: str) -> None:
    """Базовая защита от SSRF: только http/https и не приватный/loopback адрес."""
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise PdnDocumentError("Укажите корректную ссылку (http/https) на файл документа.")
    try:
        infos = socket.getaddrinfo(parsed.hostname, None)
    except OSError:
        raise PdnDocumentError("Не удалось разрешить адрес по ссылке — проверьте её.")
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
            raise PdnDocumentError("Ссылка должна вести на публичный ресурс.")


def _looks_like_html(content_type: str, body: bytes) -> bool:
    if content_type.split(";", 1)[0].strip().lower() in ("text/html", "application/xhtml+xml"):
        return True
    head = body[:256].lstrip().lower()
    return any(head.startswith(sig) for sig in _HTML_SNIFF)


def _filename_from(url: str, content_type: str) -> str:
    path = urlparse(url).path
    name = path.rsplit("/", 1)[-1] if "/" in path else path
    if name and "." in name:
        return name[:255]
    # Расширение по типу — чтобы у сохранённой копии было понятное имя.
    ext = {"application/pdf": "pdf", "application/msword": "doc"}.get(
        content_type.split(";", 1)[0].strip().lower(), "bin"
    )
    return f"document.{ext}"


def fetch_document_bytes(url: str) -> tuple[bytes, str, str]:
    """Скачивает файл по ссылке. Возвращает (bytes, filename, content_type).
    Бросает PdnDocumentError, если ссылка недоступна или ведёт на веб-страницу."""
    _guard_public_url(url)
    max_bytes = Company.load().max_upload_mb * 1024 * 1024
    try:
        resp = requests.get(url, timeout=_DOWNLOAD_TIMEOUT, stream=True, allow_redirects=True)
    except requests.RequestException:
        raise PdnDocumentError("Ссылка недоступна — файл по ней не загружается.")
    with resp:
        if resp.status_code != 200:
            raise PdnDocumentError("Ссылка недоступна — сервер не вернул файл.")
        content_type = resp.headers.get("Content-Type", "")
        chunks = bytearray()
        for chunk in resp.iter_content(64 * 1024):
            chunks.extend(chunk)
            if len(chunks) > max_bytes:
                raise PdnDocumentError(
                    f"Файл по ссылке больше допустимого размера ({Company.load().max_upload_mb} МБ)."
                )
    body = bytes(chunks)
    if not body:
        raise PdnDocumentError("По ссылке получен пустой ответ.")
    if _looks_like_html(content_type, body):
        raise PdnDocumentError("Ссылка ведёт на веб-страницу, а не на файл. Укажите прямую ссылку на файл документа.")
    return body, _filename_from(url, content_type), content_type.split(";", 1)[0].strip()


def _replace_current(kind: str, *, source_mode: str, source_url: str, stored_file) -> PdnDocument:
    """Помечает прежнюю текущую версию вида не-текущей и заводит новую."""
    with transaction.atomic():
        PdnDocument.objects.filter(kind=kind, is_current=True).update(is_current=False)
        return PdnDocument.objects.create(
            kind=kind,
            source_mode=source_mode,
            source_url=source_url,
            stored_file=stored_file,
            is_current=True,
        )


def set_document_from_link(kind: str, url: str) -> PdnDocument:
    body, filename, content_type = fetch_document_bytes(url)
    stored = store_bytes(body, filename, "pdn", content_type=content_type)
    return _replace_current(kind, source_mode=PdnDocument.SourceMode.LINK, source_url=url, stored_file=stored)


def set_document_from_file(kind: str, file_obj) -> PdnDocument:
    stored = store_uploaded_file(file_obj, "pdn")
    return _replace_current(kind, source_mode=PdnDocument.SourceMode.FILE, source_url="", stored_file=stored)


def current_documents() -> dict[str, PdnDocument | None]:
    """Текущие версии всех трёх видов (kind → PdnDocument|None)."""
    current = {d.kind: d for d in PdnDocument.objects.filter(is_current=True).select_related("stored_file")}
    return {kind: current.get(kind) for kind, _ in PdnDocument.Kind.choices}


def consent_context() -> dict:
    """Данные для экрана согласия (регистрация/приглашение/дособирание): название
    компании, ИНН и ссылки на текущие документы. Слово в тексте согласия становится
    гиперссылкой только если документ соответствующего вида задан."""
    company = Company.load()
    docs = current_documents()
    return {
        "company_name": company.name or "",
        "company_inn": company.inn or "",
        "documents": {
            kind: ({"url": doc.stored_file.url, "name": doc.stored_file.original_filename} if doc else None)
            for kind, doc in docs.items()
        },
    }
