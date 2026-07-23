from django.contrib import admin

from accounts.models import User


class ReadonlyDefaultAdminMixin:
    """B9. Единая политика прав для служебной Django-админки.

    Раздел доступен только роли «Администратор» (вход в /django_admin вдобавок
    гейтится по флагу и IP — core.middleware.AdminAccessGateMiddleware). По
    умолчанию — только просмотр: добавление/изменение/удаление разрешено
    исключительно суперпользователю (галка «разрешать редактировать» в карточке
    пользователя наделяет is_superuser; по умолчанию её нет ни у кого).

    Применяется ко всем ModelAdmin проекта. ModelAdmin, у которых есть
    собственные ограничения (Company — запрет удаления, LicenseType — запрет
    удаления базовых типов), вызывают super() и остаются строже этого mixin."""

    @staticmethod
    def _is_admin(request):
        user = request.user
        return bool(user.is_active and (user.is_superuser or getattr(user, "role", None) == User.Role.ADMIN))

    def has_module_permission(self, request):
        return self._is_admin(request)

    def has_view_permission(self, request, obj=None):
        return self._is_admin(request)

    def has_add_permission(self, request):
        return bool(request.user.is_superuser)

    def has_change_permission(self, request, obj=None):
        return bool(request.user.is_superuser)

    def has_delete_permission(self, request, obj=None):
        return bool(request.user.is_superuser)


class ReadonlyDefaultModelAdmin(ReadonlyDefaultAdminMixin, admin.ModelAdmin):
    """Готовый ModelAdmin с политикой B9 — для регистрации моделей без
    собственного класса admin (admin.site.register(Model, ReadonlyDefaultModelAdmin))."""
