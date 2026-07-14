from django.urls import path

from . import views

urlpatterns = [
    path("company/", views.CompanyBriefView.as_view(), name="company-brief"),
    path("company/settings/", views.CompanySettingsView.as_view(), name="company-settings"),
    path("setup/environment/", views.EnvironmentStatusView.as_view(), name="setup-environment"),
    path("setup/test-storage-connection/", views.TestStorageConnectionView.as_view(), name="setup-test-storage"),
    path("setup/test-email/", views.TestEmailView.as_view(), name="setup-test-email"),
    path("setup/verify-email/", views.VerifyEmailCodeView.as_view(), name="setup-verify-email"),
    path("setup/test-captcha/", views.TestCaptchaView.as_view(), name="setup-test-captcha"),
    path("setup/test-yandex-id/", views.TestYandexIDView.as_view(), name="setup-test-yandex-id"),
    path("setup/complete/", views.SetupCompleteView.as_view(), name="setup-complete"),
    path("company/storage-mode/", views.StorageModeUpdateView.as_view(), name="company-storage-mode"),
    path(
        "company/storage-migration-status/",
        views.StorageMigrationStatusView.as_view(),
        name="company-storage-migration-status",
    ),
    path(
        "company/storage-migration-retry/",
        views.StorageMigrationRetryView.as_view(),
        name="company-storage-migration-retry",
    ),
    path("company/logo/", views.CompanyLogoUploadView.as_view(), name="company-logo"),
    path("company/backup-settings/", views.BackupSettingsView.as_view(), name="company-backup-settings"),
    path("company/test-email/", views.CompanyTestEmailView.as_view(), name="company-test-email"),
    path("company/verify-email/", views.CompanyVerifyEmailView.as_view(), name="company-verify-email"),
    path("company/system-status/", views.SystemStatusView.as_view(), name="company-system-status"),
    path("company/storage-test/", views.CompanyStorageTestView.as_view(), name="company-storage-test"),
    path("company/yandex-id-check/", views.CompanyYandexIDCheckView.as_view(), name="company-yandex-id-check"),
    path("company/captcha-check/", views.CompanyCaptchaCheckView.as_view(), name="company-captcha-check"),
]
