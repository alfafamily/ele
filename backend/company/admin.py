from django.contrib import admin

from core.admin import ReadonlyDefaultAdminMixin

from .models import Company


@admin.register(Company)
class CompanyAdmin(ReadonlyDefaultAdminMixin, admin.ModelAdmin):
    list_display = ("name", "domain", "storage_mode")

    def has_add_permission(self, request):
        # Синглтон — вторую запись создать нельзя (см. Company.save()); плюс
        # редактирование в админке — только суперпользователю (B9).
        return super().has_add_permission(request) and not Company.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False
