from django.contrib import admin

from core.admin import ReadonlyDefaultAdminMixin

from .models import (
    MaintenanceRecord,
    MaintenanceRecordItem,
    MaintenanceRegulation,
    MaintenanceRegulationItem,
    Transport,
    TransportCustomField,
    TransportFieldValue,
    TransportMaintenancePlan,
    TransportType,
    TransportTypeField,
)


class TransportTypeFieldInline(admin.TabularInline):
    model = TransportTypeField
    extra = 0


@admin.register(TransportType)
class TransportTypeAdmin(ReadonlyDefaultAdminMixin, admin.ModelAdmin):
    list_display = ("name", "mileage_unit", "gibdd_registration", "is_archived")
    list_filter = ("is_archived", "mileage_unit", "gibdd_registration")
    inlines = [TransportTypeFieldInline]


class TransportFieldValueInline(admin.TabularInline):
    model = TransportFieldValue
    extra = 0


class TransportCustomFieldInline(admin.TabularInline):
    model = TransportCustomField
    extra = 0


@admin.register(Transport)
class TransportAdmin(ReadonlyDefaultAdminMixin, admin.ModelAdmin):
    list_display = ("inventory_number", "transport_type", "employee", "is_written_off")
    list_filter = ("is_written_off", "transport_type")
    search_fields = ("inventory_number",)
    inlines = [TransportFieldValueInline, TransportCustomFieldInline]


class MaintenanceRegulationItemInline(admin.TabularInline):
    model = MaintenanceRegulationItem
    extra = 0


@admin.register(MaintenanceRegulation)
class MaintenanceRegulationAdmin(ReadonlyDefaultAdminMixin, admin.ModelAdmin):
    list_display = ("name", "transport_type", "transport", "period_months", "on_demand", "is_archived")
    list_filter = ("is_archived", "on_demand")
    inlines = [MaintenanceRegulationItemInline]


@admin.register(TransportMaintenancePlan)
class TransportMaintenancePlanAdmin(ReadonlyDefaultAdminMixin, admin.ModelAdmin):
    list_display = ("transport", "regulation", "next_planned_date", "is_cancelled")
    list_filter = ("is_cancelled",)


class MaintenanceRecordItemInline(admin.TabularInline):
    model = MaintenanceRecordItem
    extra = 0


@admin.register(MaintenanceRecord)
class MaintenanceRecordAdmin(ReadonlyDefaultAdminMixin, admin.ModelAdmin):
    list_display = ("transport", "regulation_name", "performed_at", "mileage", "next_planned_date")
    inlines = [MaintenanceRecordItemInline]
