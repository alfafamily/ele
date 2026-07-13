"""Права доступа по матрице ТЗ §2.3. Роль живёт на request.user (accounts.User),
здесь — только проверки, без импорта модели (избегаем цикла core<->accounts).

Наблюдатель (§2.2) расширяет видимость только раздела Оборудование — своя
проверка появится вместе с EquipmentViewSet (Фаза 4), здесь — общие роли.
"""
from rest_framework.permissions import BasePermission


def _role(request):
    user = request.user
    return getattr(user, "role", None) if user and user.is_authenticated else None


class IsAdmin(BasePermission):
    """Администратор — единственная роль с доступом к разделу «Настройки» (§2.3)."""

    def has_permission(self, request, view):
        return _role(request) == "admin"


class IsAdminOrAccountant(BasePermission):
    """Администратор или Ответственный за учёт — полный доступ к бизнес-объектам (§2.3)."""

    def has_permission(self, request, view):
        return _role(request) in ("admin", "accountant")


_SAFE_METHODS = ("GET", "HEAD", "OPTIONS")


class EquipmentAccessPermission(BasePermission):
    """Оборудование — единственный раздел, где Сотрудник вообще что-то видит
    (§2.3): свои объекты, либо все — с признаком «Наблюдатель» (§2.2), но
    всегда только на просмотр. Фильтрация списка под «только своё» —
    в EquipmentViewSet.get_queryset(), здесь — доступ к разделу и объекту."""

    def has_permission(self, request, view):
        role = _role(request)
        if role in ("admin", "accountant"):
            return True
        return role == "employee" and request.method in _SAFE_METHODS

    def has_object_permission(self, request, view, obj):
        role = _role(request)
        if role in ("admin", "accountant"):
            return True
        if role != "employee" or request.method not in _SAFE_METHODS:
            return False
        user = request.user
        return user.is_observer or obj.employee_id == user.employee_id
