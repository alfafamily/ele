from django.contrib import admin

from core.admin import ReadonlyDefaultAdminMixin

from .models import (
    License,
    LicenseCustomField,
    LicenseFieldValue,
    LicenseType,
    LicenseTypeField,
)


class LicenseTypeFieldInline(admin.TabularInline):
    model = LicenseTypeField
    extra = 0


@admin.register(LicenseType)
class LicenseTypeAdmin(ReadonlyDefaultAdminMixin, admin.ModelAdmin):
    list_display = ("name", "is_archived", "is_locked")
    list_filter = ("is_archived", "is_locked")
    inlines = [LicenseTypeFieldInline]

    def get_readonly_fields(self, request, obj=None):
        if obj and obj.is_locked:
            # Имя базового Типа не редактируется.
            return ("name", "is_locked")
        return ("is_locked",)

    def has_delete_permission(self, request, obj=None):
        # Кнопка удаления для базовых Типов не отображается.
        if obj is not None and obj.is_locked:
            return False
        return super().has_delete_permission(request, obj)


class LicenseFieldValueInline(admin.TabularInline):
    model = LicenseFieldValue
    extra = 0


class LicenseCustomFieldInline(admin.TabularInline):
    model = LicenseCustomField
    extra = 0


@admin.register(License)
class LicenseAdmin(ReadonlyDefaultAdminMixin, admin.ModelAdmin):
    list_display = ("name", "license_type", "equipment", "is_retired")
    list_filter = ("license_type", "is_retired")
    search_fields = ("name",)
    inlines = [LicenseFieldValueInline, LicenseCustomFieldInline]
