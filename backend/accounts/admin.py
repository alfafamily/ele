from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .forms import UserChangeForm, UserCreationForm
from .models import User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    """Временный доступ к User через Django admin для проверки моделей
    Фазы 2. Реальные экраны управления пользователями — Фаза 8 (S1/S4)."""

    form = UserChangeForm
    add_form = UserCreationForm

    ordering = ("email",)
    list_display = ("email", "role", "is_observer", "can_maintain", "is_active", "is_email_confirmed", "employee")
    list_filter = ("role", "is_observer", "can_maintain", "is_active", "is_email_confirmed")
    search_fields = ("email",)

    fieldsets = (
        (None, {"fields": ("email", "password")}),
        (
            "Права доступа",
            {
                "fields": (
                    "role",
                    "is_observer",
                    "can_maintain",
                    "employee",
                    "is_active",
                    "is_email_confirmed",
                    "is_staff",
                    "is_superuser",
                    "groups",
                    "user_permissions",
                )
            },
        ),
        ("Даты", {"fields": ("last_login", "date_joined")}),
    )
    add_fieldsets = (
        (None, {"classes": ("wide",), "fields": ("email", "password1", "password2", "role")}),
    )
    readonly_fields = ("date_joined",)
