import re

from django.core.exceptions import ValidationError


class ComplexityPasswordValidator:
    """Строчные и прописные латинские буквы, цифры, спецсимволы."""

    SPECIAL_CHARS = re.compile(r"[!\"#$%&'()*+,\-./:;<=>?@\[\]^_`{|}~]")

    def validate(self, password, user=None):
        errors = []
        if not re.search(r"[a-z]", password):
            errors.append("строчную латинскую букву")
        if not re.search(r"[A-Z]", password):
            errors.append("прописную латинскую букву")
        if not re.search(r"\d", password):
            errors.append("цифру")
        if not self.SPECIAL_CHARS.search(password):
            errors.append("специальный символ")
        if errors:
            raise ValidationError(
                "Пароль должен содержать: " + ", ".join(errors) + ".",
                code="password_missing_complexity",
            )

    def get_help_text(self):
        return "Пароль должен содержать строчные и прописные латинские буквы, цифры и специальные символы."
