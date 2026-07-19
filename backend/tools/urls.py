from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("tools", views.ToolViewSet, basename="tool")

urlpatterns = router.urls
