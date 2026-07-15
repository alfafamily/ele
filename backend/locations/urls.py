from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("buildings", views.BuildingViewSet, basename="building")
router.register("rooms", views.RoomViewSet, basename="room")
router.register("places", views.PlaceViewSet, basename="place")

urlpatterns = router.urls
