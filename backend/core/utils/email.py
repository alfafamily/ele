"""Общая часть отправки писем — вынесена из accounts/emails.py, чтобы не
дублировать при добавлении письма с кодом подтверждения (company/setup_email.py)."""
import re
from email.message import MIMEPart

from django.contrib.staticfiles import finders
from django.utils.html import strip_tags

_STYLE_TAG_RE = re.compile(r"<style\b[^>]*>.*?</style>", re.IGNORECASE | re.DOTALL)

# Идентификатор inline-изображения логотипа; в шаблонах — <img src="cid:ele-logo">.
ELE_LOGO_CID = "ele-logo"


def html_to_plain_text(html_body: str) -> str:
    # strip_tags() не убирает содержимое <style> — без этого CSS-правила
    # протекают в текстовую версию письма.
    without_style = _STYLE_TAG_RE.sub("", html_body)
    text = strip_tags(without_style)
    return re.sub(r"\n\s*\n+", "\n\n", text).strip()


def attach_ele_logo(message) -> None:
    """Встраивает логотип ELE в письмо как inline-изображение (cid:ele-logo).

    PNG, а не SVG: SVG большинство почтовых клиентов (Gmail, Outlook, Apple
    Mail) не отображают — вместо логотипа виден значок «битого» файла. Способ
    cid (multipart/related) надёжнее base64/data-URI, которые Gmail и Outlook
    вырезают.
    """
    path = finders.find(f"email/{ELE_LOGO_CID}.png")
    if not path:  # без логотипа письмо всё равно валидно — не рушим отправку
        return
    with open(path, "rb") as f:
        data = f.read()
    part = MIMEPart()
    # cid делает картинку inline-ресурсом для <img src="cid:ele-logo">;
    # disposition inline — чтобы клиент не показывал её отдельным вложением.
    part.set_content(
        data,
        maintype="image",
        subtype="png",
        disposition="inline",
        cid=f"<{ELE_LOGO_CID}>",
        filename=f"{ELE_LOGO_CID}.png",
    )
    message.attach(part)
