from django.urls import path

from . import views

urlpatterns = [
    path("health/", views.health, name="health"),
    path("internal/ip-check/", views.ip_check, name="ip-check"),
]
