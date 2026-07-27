from django.urls import path

from . import views

urlpatterns = [
    path("backup/create/", views.BackupCreateView.as_view(), name="backup-create"),
    path("backup/history/", views.BackupListView.as_view(), name="backup-history"),
    path("backup/<int:pk>/download/", views.BackupDownloadView.as_view(), name="backup-download"),
    path("backup/<int:pk>/", views.BackupDeleteView.as_view(), name="backup-delete"),
    path("backup/secondary-s3/test/", views.BackupSecondaryS3TestView.as_view(), name="backup-secondary-s3-test"),
]
