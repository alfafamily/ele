from django.contrib import admin

from .models import Tool, ToolAllocation, ToolCustomField, ToolMovement


@admin.register(Tool)
class ToolAdmin(admin.ModelAdmin):
    list_display = ("name", "quantity", "is_written_off", "created_at")
    search_fields = ("name",)


admin.site.register(ToolCustomField)
admin.site.register(ToolAllocation)
admin.site.register(ToolMovement)
