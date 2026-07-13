from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("license-types", views.LicenseTypeViewSet, basename="license-type")
router.register("licenses", views.LicenseViewSet, basename="license")

urlpatterns = router.urls + [
    path(
        "license-types/<int:type_pk>/fields/",
        views.LicenseTypeFieldListView.as_view(),
        name="license-type-field-list",
    ),
    path(
        "license-types/<int:type_pk>/fields/<int:pk>/",
        views.LicenseTypeFieldDetailView.as_view(),
        name="license-type-field-detail",
    ),
    path(
        "license-types/<int:type_pk>/fields/<int:pk>/impact/",
        views.LicenseTypeFieldImpactView.as_view(),
        name="license-type-field-impact",
    ),
]
