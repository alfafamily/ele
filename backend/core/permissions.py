"""Права доступа по матрице. Роль живёт на request.user (accounts.User),
здесь — только проверки, без импорта модели (избегаем цикла core<->accounts).

Наблюдатель (employee + is_observer) — сквозной просмотр всех бизнес-разделов
(кроме «Настроек» и редактора Типов), строго read-only. Обычный «Сотрудник»
(без признака) видит только свой Профиль и свои объекты в нём.
"""
from rest_framework.permissions import BasePermission


def _role(request):
    user = request.user
    return getattr(user, "role", None) if user and user.is_authenticated else None


def _is_observer(request):
    user = request.user
    return _role(request) == "employee" and getattr(user, "is_observer", False)


class IsAdmin(BasePermission):
    """Администратор — единственная роль с доступом к разделу «Настройки»."""

    def has_permission(self, request, view):
        return _role(request) == "admin"


class IsAdminOrAccountant(BasePermission):
    """Администратор или Ответственный за учёт — полный доступ к бизнес-объектам."""

    def has_permission(self, request, view):
        return _role(request) in ("admin", "accountant")


_SAFE_METHODS = ("GET", "HEAD", "OPTIONS")


class IsAdminOrAccountantOrReadOnlyObserver(BasePermission):
    """Admin/Accountant — полный доступ; Наблюдатель — только чтение
    (SAFE_METHODS). Прочие роли к разделу не допускаются. Управляющие действия
    вьюсета остаются за своими permission_classes=[IsAdminOrAccountant]."""

    def has_permission(self, request, view):
        if _role(request) in ("admin", "accountant"):
            return True
        return _is_observer(request) and request.method in _SAFE_METHODS


class EquipmentAccessPermission(BasePermission):
    """Оборудование — единственный раздел, где Сотрудник вообще что-то видит
   : свои объекты, либо все — с признаком «Наблюдатель», но
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


class ToolAccessPermission(BasePermission):
    """Инструменты — как Оборудование: Сотрудник видит инструменты, где за ним
    закреплены единицы (или все — с признаком «Наблюдатель»), только на просмотр.
    Фильтрация списка под «только своё» — в ToolViewSet.get_queryset()."""

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
        return user.is_observer or (
            bool(user.employee_id) and obj.allocations.filter(employee_id=user.employee_id).exists()
        )


class SimCardAccessPermission(BasePermission):
    """SIM-карты: управление — admin/accountant. Наблюдатель — просмотр всех
    номеров (раздел «Корпоративная связь»); обычный «Сотрудник» — только свои
    номера в Профиле. Фильтрация — в SimCardViewSet.get_queryset()."""

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
        # Наблюдатель видит любую карту; обычный сотрудник — только свою.
        return request.user.is_observer or obj.employee_id == request.user.employee_id


class AccessPassAccessPermission(BasePermission):
    """Пропуска СКУД: управление — admin/accountant. Наблюдатель — просмотр всех
    средств доступа (раздел «Средства доступа»); обычный «Сотрудник» — только
    свои в Профиле. Фильтрация — в AccessPassViewSet.get_queryset()."""

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
        # Наблюдатель видит любой пропуск; обычный сотрудник — только свой.
        return request.user.is_observer or obj.employee_id == request.user.employee_id
