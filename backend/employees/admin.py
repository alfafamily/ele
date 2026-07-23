from django.contrib import admin

from core.admin import ReadonlyDefaultAdminMixin

from .models import AccessPass, Employee, SimCard


@admin.register(Employee)
class EmployeeAdmin(ReadonlyDefaultAdminMixin, admin.ModelAdmin):
    list_display = ("last_name", "first_name", "position", "department", "is_employed")
    list_filter = ("is_employed", "department")
    search_fields = ("last_name", "first_name")


@admin.register(SimCard)
class SimCardAdmin(ReadonlyDefaultAdminMixin, admin.ModelAdmin):
    list_display = ("phone_number", "sim_type", "network_operator", "provider", "employee", "is_deactivated")
    list_filter = ("sim_type", "network_operator", "provider")
    search_fields = ("phone_number", "employee__last_name", "employee__first_name")


@admin.register(AccessPass)
class AccessPassAdmin(ReadonlyDefaultAdminMixin, admin.ModelAdmin):
    list_display = ("object_type", "account_number", "employee", "is_deactivated")
    list_filter = ("type_vehicle", "type_pedestrian", "buildings")
    search_fields = ("account_number", "employee__last_name", "employee__first_name")
    filter_horizontal = ("buildings", "rooms")
