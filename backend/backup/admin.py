from django.contrib import admin

from .models import BackupRecord


@admin.register(BackupRecord)
class BackupRecordAdmin(admin.ModelAdmin):
    list_display = ("created_at", "backup_type", "file")
    list_filter = ("backup_type",)
