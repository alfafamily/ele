from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("users", views.UserViewSet, basename="user")

urlpatterns = [
    path("auth/bootstrap/", views.BootstrapView.as_view(), name="auth-bootstrap"),
    path("auth/csrf/", views.CsrfView.as_view(), name="auth-csrf"),
    path("auth/me/", views.MeView.as_view(), name="auth-me"),
    path("auth/register/", views.RegisterView.as_view(), name="auth-register"),
    path("auth/confirm-email/", views.ConfirmEmailView.as_view(), name="auth-confirm-email"),
    path("auth/resend-confirmation/", views.ResendConfirmationView.as_view(), name="auth-resend-confirmation"),
    path("auth/login/", views.LoginView.as_view(), name="auth-login"),
    path("auth/logout/", views.LogoutView.as_view(), name="auth-logout"),
    path("auth/password-reset/", views.PasswordResetRequestView.as_view(), name="auth-password-reset"),
    path("auth/password-reset/confirm/", views.PasswordResetConfirmView.as_view(), name="auth-password-reset-confirm"),
    path("auth/accept-invite/", views.AcceptInviteView.as_view(), name="auth-accept-invite"),
    path("auth/change-password/", views.ChangePasswordView.as_view(), name="auth-change-password"),
    path("auth/change-email/", views.ChangeEmailRequestView.as_view(), name="auth-change-email"),
    path("auth/change-email/confirm/", views.ChangeEmailConfirmView.as_view(), name="auth-change-email-confirm"),
    path("auth/yandex-id/authorize/", views.YandexIDAuthorizeView.as_view(), name="auth-yandex-authorize"),
    path("auth/yandex-id/callback/", views.YandexIDCallbackView.as_view(), name="auth-yandex-callback"),
    # Литерал должен идти раньше роутера — иначе users/<pk>/ маршрут router'а
    # перехватит "users/invite/", приняв "invite" за pk.
    path("users/invite/", views.InviteView.as_view(), name="users-invite"),
] + router.urls
