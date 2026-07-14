"""Токены для email-подтверждений и установки/сброса пароля.

Приглашение и сброс пароля используют штатный
django.contrib.auth.tokens.PasswordResetTokenGenerator — токен привязан к
текущему состоянию пароля/last_login и автоматически становится
недействительным после использования или смены пароля, ровно то, что нужно
для «установить пароль по ссылке» . Отдельного хранения токена
в БД не требуется.

Подтверждение email/смена email — та же идея через django.core.signing
(payload несёт user_id и, для смены email, новый адрес — доп. поля хранить
в БД не нужно).
"""
from django.contrib.auth.tokens import PasswordResetTokenGenerator
from django.core import signing
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from django.utils.encoding import force_bytes, force_str

set_password_token_generator = PasswordResetTokenGenerator()

_EMAIL_CONFIRM_SALT = "accounts.confirm_email"
_EMAIL_CHANGE_SALT = "accounts.change_email"


def make_set_password_link(user) -> tuple[str, str]:
    """uid + токен для ссылки установки/сброса пароля (приглашение, forgot password)."""
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = set_password_token_generator.make_token(user)
    return uid, token


def get_user_from_uid(uid_b64: str, user_model):
    try:
        pk = force_str(urlsafe_base64_decode(uid_b64))
        return user_model.objects.get(pk=pk)
    except (user_model.DoesNotExist, ValueError, TypeError, OverflowError):
        return None


def make_email_confirmation_token(user) -> str:
    return signing.dumps({"user_id": user.pk}, salt=_EMAIL_CONFIRM_SALT)


def read_email_confirmation_token(token: str, max_age: int) -> int | None:
    try:
        data = signing.loads(token, salt=_EMAIL_CONFIRM_SALT, max_age=max_age)
        return data["user_id"]
    except (signing.BadSignature, KeyError):
        return None


def make_email_change_token(user, new_email: str) -> str:
    return signing.dumps({"user_id": user.pk, "new_email": new_email}, salt=_EMAIL_CHANGE_SALT)


def read_email_change_token(token: str, max_age: int) -> dict | None:
    try:
        return signing.loads(token, salt=_EMAIL_CHANGE_SALT, max_age=max_age)
    except (signing.BadSignature, KeyError):
        return None
