from django.contrib import admin

from .models import Company


@admin.register(Company)
class CompanyAdmin(admin.ModelAdmin):
    list_display = ("name", "domain", "storage_mode")

    def has_add_permission(self, request):
        # Синглтон — вторую запись создать нельзя (см. Company.save()).
        return not Company.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False
