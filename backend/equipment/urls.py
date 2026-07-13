from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("equipment-types", views.EquipmentTypeViewSet, basename="equipment-type")
router.register("equipment", views.EquipmentViewSet, basename="equipment")

urlpatterns = router.urls + [
    path(
        "equipment-types/<int:type_pk>/fields/",
        views.EquipmentTypeFieldListView.as_view(),
        name="equipment-type-field-list",
    ),
    path(
        "equipment-types/<int:type_pk>/fields/<int:pk>/",
        views.EquipmentTypeFieldDetailView.as_view(),
        name="equipment-type-field-detail",
    ),
    path(
        "equipment-types/<int:type_pk>/fields/<int:pk>/impact/",
        views.EquipmentTypeFieldImpactView.as_view(),
        name="equipment-type-field-impact",
    ),
]
