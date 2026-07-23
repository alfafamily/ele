"""B9: на существующих инсталляциях первый администратор был создан как
superuser. С вводом контролируемого доступа в Django-админку доступ по умолчанию
закрыт, а права правки (is_superuser) выдаются осознанно через Настройки.

Поэтому при обновлении снимаем is_superuser у всех — инстанс приходит в
«закрытое» состояние. На работу приложения это не влияет: авторизация в
приложении идёт по role, а не по is_superuser (is_staff/роль не трогаем — вход и
доступ к разделам сохраняются). Вернуть права можно из Настроек → Системные либо
через createsuperuser."""
from django.db import migrations


def strip_superuser(apps, schema_editor):
    User = apps.get_model("accounts", "User")
    User.objects.filter(is_superuser=True).update(is_superuser=False)


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0005_user_can_manage_regulations_and_more"),
    ]

    operations = [
        # Необратимо: обратная миграция не восстанавливает superuser (какой именно
        # аккаунт им был — не знаем; при откате права выдаются заново вручную).
        migrations.RunPython(strip_superuser, migrations.RunPython.noop),
    ]
