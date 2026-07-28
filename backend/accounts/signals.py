"""B32. Реакция на увязку пользователя к сотруднику.

Когда у сотрудника появляется связанный пользователь (приглашение/регистрация/
Яндекс ID/правка), его «заочные» открытые эпизоды закрепления переводятся в
«ожидает подтверждения» — теперь есть кому подтвердить/отклонить. Реализовано
сигналами (pre_save запоминает прежнего сотрудника, post_save сравнивает), чтобы
покрыть все пути установки User.employee единообразно и не гонять пересчёт на
каждом сохранении пользователя (логин и т.п.).
"""

from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver

from .models import User


@receiver(pre_save, sender=User)
def _stash_old_employee(sender, instance, **kwargs):
    if instance.pk:
        instance._old_employee_id = (
            sender.objects.filter(pk=instance.pk).values_list("employee_id", flat=True).first()
        )
    else:
        instance._old_employee_id = None


@receiver(post_save, sender=User)
def _relink_on_employee_change(sender, instance, created, **kwargs):
    old = getattr(instance, "_old_employee_id", None)
    if instance.employee_id and instance.employee_id != old:
        from core.assignments import relink_in_absentia

        relink_in_absentia(instance.employee)
