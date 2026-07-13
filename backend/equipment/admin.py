from django.contrib import admin

from .models import (
    Equipment,
    EquipmentCustomField,
    EquipmentFieldValue,
    EquipmentType,
    EquipmentTypeField,
)


class EquipmentTypeFieldInline(admin.TabularInline):
    model = EquipmentTypeField
    extra = 0


@admin.register(EquipmentType)
class EquipmentTypeAdmin(admin.ModelAdmin):
    list_display = ("name", "is_archived")
    list_filter = ("is_archived",)
    inlines = [EquipmentTypeFieldInline]


class EquipmentFieldValueInline(admin.TabularInline):
    model = EquipmentFieldValue
    extra = 0


class EquipmentCustomFieldInline(admin.TabularInline):
    model = EquipmentCustomField
    extra = 0


@admin.register(Equipment)
class EquipmentAdmin(admin.ModelAdmin):
    list_display = ("inventory_number", "equipment_type", "employee", "is_written_off")
    list_filter = ("equipment_type", "is_written_off")
    search_fields = ("inventory_number",)
    inlines = [EquipmentFieldValueInline, EquipmentCustomFieldInline]
