from django.contrib import admin

from core.admin import ReadonlyDefaultAdminMixin

from .models import (
    Equipment,
    EquipmentCustomField,
    EquipmentFieldValue,
    EquipmentMaintenancePlan,
    EquipmentType,
    EquipmentTypeField,
    MaintenanceRecord,
    MaintenanceRecordItem,
    MaintenanceRegulation,
    MaintenanceRegulationItem,
)


class EquipmentTypeFieldInline(admin.TabularInline):
    model = EquipmentTypeField
    extra = 0


@admin.register(EquipmentType)
class EquipmentTypeAdmin(ReadonlyDefaultAdminMixin, admin.ModelAdmin):
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
class EquipmentAdmin(ReadonlyDefaultAdminMixin, admin.ModelAdmin):
    list_display = ("inventory_number", "equipment_type", "employee", "is_written_off")
    list_filter = ("equipment_type", "is_written_off")
    search_fields = ("inventory_number",)
    inlines = [EquipmentFieldValueInline, EquipmentCustomFieldInline]


class MaintenanceRecordItemInline(admin.TabularInline):
    model = MaintenanceRecordItem
    extra = 0


@admin.register(MaintenanceRecord)
class MaintenanceRecordAdmin(ReadonlyDefaultAdminMixin, admin.ModelAdmin):
    list_display = ("equipment", "regulation_name", "performed_at", "next_planned_date", "prior_planned_date", "created_by")
    list_filter = ("performed_at",)
    search_fields = ("equipment__inventory_number",)
    inlines = [MaintenanceRecordItemInline]


class MaintenanceRegulationItemInline(admin.TabularInline):
    model = MaintenanceRegulationItem
    extra = 0


@admin.register(MaintenanceRegulation)
class MaintenanceRegulationAdmin(ReadonlyDefaultAdminMixin, admin.ModelAdmin):
    list_display = ("name", "equipment_type", "equipment", "period_months", "on_demand", "is_archived")
    list_filter = ("on_demand", "is_archived")
    inlines = [MaintenanceRegulationItemInline]


@admin.register(EquipmentMaintenancePlan)
class EquipmentMaintenancePlanAdmin(ReadonlyDefaultAdminMixin, admin.ModelAdmin):
    list_display = ("equipment", "regulation", "next_planned_date", "is_cancelled")
    list_filter = ("is_cancelled",)
