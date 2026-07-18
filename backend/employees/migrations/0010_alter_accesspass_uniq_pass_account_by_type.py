from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('employees', '0009_accesspass_places_historicalaccesspass_places'),
    ]

    operations = [
        # Уникальность учётного номера пропуска/ключа теперь в разрезе типа
        # объекта: пропуска и ключи имеют независимые пространства номеров (B1).
        migrations.RemoveConstraint(
            model_name='accesspass',
            name='uniq_pass_account',
        ),
        migrations.AddConstraint(
            model_name='accesspass',
            constraint=models.UniqueConstraint(
                condition=models.Q(('account_number', ''), _negated=True),
                fields=('object_type', 'account_number'),
                name='uniq_pass_account',
            ),
        ),
    ]
