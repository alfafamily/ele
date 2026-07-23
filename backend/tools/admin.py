from django.contrib import admin

from core.admin import ReadonlyDefaultAdminMixin, ReadonlyDefaultModelAdmin

from .models import Tool, ToolAllocation, ToolCustomField, ToolMovement


@admin.register(Tool)
class ToolAdmin(ReadonlyDefaultAdminMixin, admin.ModelAdmin):
    list_display = ("name", "quantity", "is_written_off", "created_at")
    search_fields = ("name",)


admin.site.register(ToolCustomField, ReadonlyDefaultModelAdmin)
admin.site.register(ToolAllocation, ReadonlyDefaultModelAdmin)
admin.site.register(ToolMovement, ReadonlyDefaultModelAdmin)
