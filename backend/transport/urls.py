from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("transport-types", views.TransportTypeViewSet, basename="transport-type")
router.register("transport", views.TransportViewSet, basename="transport")

urlpatterns = router.urls + [
    path(
        "transport-types/<int:type_pk>/fields/",
        views.TransportTypeFieldListView.as_view(),
        name="transport-type-field-list",
    ),
    path(
        "transport-types/<int:type_pk>/fields/reorder/",
        views.TransportTypeFieldReorderView.as_view(),
        name="transport-type-field-reorder",
    ),
    path(
        "transport-types/<int:type_pk>/fields/<int:pk>/",
        views.TransportTypeFieldDetailView.as_view(),
        name="transport-type-field-detail",
    ),
    path(
        "transport-types/<int:type_pk>/fields/<int:pk>/impact/",
        views.TransportTypeFieldImpactView.as_view(),
        name="transport-type-field-impact",
    ),
    path(
        "transport-types/<int:type_pk>/regulations/",
        views.TypeRegulationListView.as_view(),
        name="transport-type-regulation-list",
    ),
    path(
        "transport-types/<int:type_pk>/regulations/<int:pk>/",
        views.TypeRegulationDetailView.as_view(),
        name="transport-type-regulation-detail",
    ),
]
