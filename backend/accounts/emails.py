"""Отправка транзакционных писем — базовый шаблон + 5 конкретных.

Ссылки в письмах ведут на роуты SPA (Фаза 7 их реализует), backend только
формирует токены и URL. Домены/пути ниже — контракт с фронтендом.
"""
from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string
from django.utils import timezone

from core.utils.email import attach_ele_logo, html_to_plain_text

from .tokens import make_email_change_token, make_email_confirmation_token, make_set_password_link

# Тема письма задаётся явно (не парсится из HTML <title>);
# шаблоны писем — backend/templates/email/*.html.
_SUBJECTS = {
    "confirm_email": "Подтвердите почту — ELE",
    "invite": "Вас пригласили в ELE — {company_name}",
    "password_reset": "Восстановление пароля — ELE",
    "email_change_confirm": "Подтвердите новый email — ELE",
}


def _company_name() -> str:
    from company.models import Company

    return Company.load().name or "ELE"


def _send(kind: str, template: str, to: list[str], context: dict):
    context = {"company_name": _company_name(), **context}
    subject = _SUBJECTS[kind].format(**context)
    html_body = render_to_string(f"email/{template}", context)
    message = EmailMultiAlternatives(subject, html_to_plain_text(html_body), settings.DEFAULT_FROM_EMAIL, to)
    message.attach_alternative(html_body, "text/html")
    attach_ele_logo(message)
    message.send()


def send_confirm_email(user):
    token = make_email_confirmation_token(user)
    cta_url = f"{settings.SITE_URL}/confirm-email/{token}/"
    _send("confirm_email", "confirm_email.html", [user.email], {"cta_url": cta_url})
    user.email_confirmation_sent_at = timezone.now()
    user.save(update_fields=["email_confirmation_sent_at"])


def send_invite(user):
    uid, token = make_set_password_link(user)
    cta_url = f"{settings.SITE_URL}/accept-invite/{uid}/{token}/"
    role_name = user.get_role_display()
    _send("invite", "invite.html", [user.email], {"cta_url": cta_url, "role_name": role_name})
    user.invite_sent_at = timezone.now()
    user.save(update_fields=["invite_sent_at"])


def send_password_reset(user):
    uid, token = make_set_password_link(user)
    cta_url = f"{settings.SITE_URL}/reset-password/{uid}/{token}/"
    _send("password_reset", "password_reset.html", [user.email], {"cta_url": cta_url, "user_email": user.email})


def send_email_change_confirm(user, new_email: str):
    token = make_email_change_token(user, new_email)
    cta_url = f"{settings.SITE_URL}/change-email/{token}/"
    _send(
        "email_change_confirm",
        "email_change_confirm.html",
        [new_email],
        {"cta_url": cta_url, "old_email": user.email, "new_email": new_email},
    )
