"""Письмо с кодом подтверждения для проверки SMTP в Setup Wizard (шаг 3).
Не входит в число основных писем, вспомогательное для мастера."""
import secrets

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string

from core.utils.email import attach_ele_logo, html_to_plain_text

CODE_TTL_SECONDS = 10 * 60


def generate_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def send_test_code_email(to_email: str, code: str) -> None:
    context = {"code": code, "company_name": "ELE"}
    html_body = render_to_string("email/setup_test_code.html", context)
    message = EmailMultiAlternatives(
        f"Код подтверждения: {code}",
        html_to_plain_text(html_body),
        settings.DEFAULT_FROM_EMAIL,
        [to_email],
    )
    message.attach_alternative(html_body, "text/html")
    attach_ele_logo(message)
    message.send()
