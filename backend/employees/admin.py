from django.contrib import admin

from .models import Employee


@admin.register(Employee)
class EmployeeAdmin(admin.ModelAdmin):
    list_display = ("last_name", "first_name", "position", "department", "is_employed")
    list_filter = ("is_employed", "department")
    search_fields = ("last_name", "first_name")
