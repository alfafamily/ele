from django.contrib import admin

from core.admin import ReadonlyDefaultAdminMixin

from .models import StoredFile


@admin.register(StoredFile)
class StoredFileAdmin(ReadonlyDefaultAdminMixin, admin.ModelAdmin):
    list_display = ("original_filename", "backend", "migration_status", "size", "created_at")
    list_filter = ("backend", "migration_status")
    search_fields = ("original_filename", "path")
