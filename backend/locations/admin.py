from django.contrib import admin

from .models import Building, Place, Room


@admin.register(Building)
class BuildingAdmin(admin.ModelAdmin):
    list_display = ("name", "address", "floor_count", "is_archived")
    list_filter = ("is_archived",)
    search_fields = ("name", "address")


@admin.register(Room)
class RoomAdmin(admin.ModelAdmin):
    list_display = ("name", "floor", "building", "is_archived")
    list_filter = ("is_archived", "building")
    search_fields = ("name",)


@admin.register(Place)
class PlaceAdmin(admin.ModelAdmin):
    list_display = ("name", "room", "is_archived")
    list_filter = ("is_archived",)
    search_fields = ("name",)
