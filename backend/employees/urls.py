from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("employees", views.EmployeeViewSet, basename="employee")
router.register("sim-cards", views.SimCardViewSet, basename="sim-card")

urlpatterns = [
    path(
        "employees/<int:employee_pk>/avatar/",
        views.EmployeeAvatarUploadView.as_view(),
        name="employee-avatar",
    ),
] + router.urls
