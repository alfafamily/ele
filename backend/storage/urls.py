from django.urls import path

from . import views

urlpatterns = [
    path("files/<int:pk>/inline/", views.StoredFileInlineView.as_view(), name="stored-file-inline"),
]
