"""Общая часть отправки писем — вынесена из accounts/emails.py, чтобы не
дублировать при добавлении письма с кодом подтверждения (company/setup_email.py)."""
import re

from django.utils.html import strip_tags

_STYLE_TAG_RE = re.compile(r"<style\b[^>]*>.*?</style>", re.IGNORECASE | re.DOTALL)


def html_to_plain_text(html_body: str) -> str:
    # strip_tags() не убирает содержимое <style> — без этого CSS-правила
    # протекают в текстовую версию письма.
    without_style = _STYLE_TAG_RE.sub("", html_body)
    text = strip_tags(without_style)
    return re.sub(r"\n\s*\n+", "\n\n", text).strip()
