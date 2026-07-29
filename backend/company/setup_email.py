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


def send_test_code_email(to_email: str, code: str, company_name: str | None = None) -> None:
    # Имя компании берём из мастера (введено на шаге 2, ещё не сохранено в БД),
    # иначе из БД (проверка SMTP в Настройках уже работающей системы). Нет имени —
    # подвал письма выводится без скобок.
    from company.models import Company

    name = (company_name or "").strip() or (Company.load().name or "").strip()
    context = {"code": code, "company_name": name or "ELE", "has_company_name": bool(name)}
    html_body = render_to_string("email/setup_test_code.html", context)
    message = EmailMultiAlternatives(
        "Код подтверждения для проверки SMTP",
        html_to_plain_text(html_body),
        settings.DEFAULT_FROM_EMAIL,
        [to_email],
    )
    message.attach_alternative(html_body, "text/html")
    attach_ele_logo(message)
    message.send()
