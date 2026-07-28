from django.apps import AppConfig


class AccountsConfig(AppConfig):
    name = 'accounts'

    def ready(self):
        from . import signals  # noqa: F401  — регистрация сигналов B32
