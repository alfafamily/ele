"""Единый формат ошибок API (ТЗ §8.7):
{"detail": "..."} — общие ошибки (403/404/500/...), это уже поведение DRF по
умолчанию; {"errors": {"поле": ["текст"]}} — ошибки валидации формы, которые
DRF по умолчанию кладёт в тело ответа без обёртки "errors"."""
from rest_framework.exceptions import ValidationError
from rest_framework.views import exception_handler as drf_exception_handler


def exception_handler(exc, context):
    response = drf_exception_handler(exc, context)
    if response is None:
        return None

    if isinstance(exc, ValidationError):
        data = response.data
        if not isinstance(data, dict):
            data = {"non_field_errors": data}
        response.data = {"errors": data}

    return response
