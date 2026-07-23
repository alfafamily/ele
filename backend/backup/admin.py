from django.contrib import admin

from core.admin import ReadonlyDefaultAdminMixin

from .models import BackupRecord


@admin.register(BackupRecord)
class BackupRecordAdmin(ReadonlyDefaultAdminMixin, admin.ModelAdmin):
    list_display = ("created_at", "backup_type", "file")
    list_filter = ("backup_type",)
