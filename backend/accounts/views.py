from datetime import timedelta
from smtplib import SMTPException

from django.conf import settings
from django.contrib.auth import get_user_model, login, logout, update_session_auth_hash
from django.db import transaction
from django.http import HttpResponseRedirect
from django.middleware.csrf import get_token
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from core.pagination import ELECursorPagination
from core.permissions import IsAdmin
from core.utils.client_ip import get_client_ip

from .captcha import is_captcha_enabled, verify_captcha
from .emails import send_confirm_email, send_email_change_confirm, send_password_reset
from .serializers import (
    ChangeEmailConfirmSerializer,
    ChangeEmailRequestSerializer,
    ChangePasswordSerializer,
    InviteSerializer,
    LoginSerializer,
    MeSerializer,
    PasswordResetRequestSerializer,
    RegisterSerializer,
    SetPasswordConfirmSerializer,
    UserListSerializer,
    UserSerializer,
)
from .tokens import read_email_confirmation_token
from .yandex_oauth import (
    build_authorize_url,
    exchange_code_for_token,
    fetch_user_info,
    is_yandex_id_enabled,
    make_state,
)

User = get_user_model()

_RESEND_COOLDOWN = timedelta(seconds=60)
_LOCKOUT_DURATION = timedelta(minutes=5)
_CAPTCHA_FROM_ATTEMPT = 2  # 0-indexed: 3-я попытка подряд (ТЗ §4.6)
_MAX_ATTEMPTS = 5


class BootstrapView(APIView):
    """Что показать при заходе (Setup Wizard/логин) и какие способы входа
    активны — фронт не хардкодит наличие Яндекс ID/капчи (ТЗ §4.3, §4.6)."""

    permission_classes = [AllowAny]

    def get(self, request):
        setup_required = not User.objects.filter(role=User.Role.ADMIN).exists()
        return Response(
            {
                "setup_required": setup_required,
                "yandex_id_enabled": is_yandex_id_enabled(),
                "captcha_enabled": is_captcha_enabled(),
                "captcha_site_key": settings.YANDEX_SMARTCAPTCHA_SITE_KEY or None,
            }
        )


class CsrfView(APIView):
    """Гарантирует установку csrftoken-cookie перед первым POST (login/register)."""

    permission_classes = [AllowAny]

    def get(self, request):
        get_token(request)
        return Response({"detail": "ok"})


class MeView(APIView):
    def get(self, request):
        return Response(MeSerializer(request.user).data)


class RegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        send_confirm_email(user)
        return Response({"detail": "Письмо с подтверждением отправлено."}, status=201)


class ConfirmEmailView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        token = request.data.get("token", "")
        user_id = read_email_confirmation_token(token, max_age=settings.PASSWORD_RESET_TIMEOUT)
        user = User.objects.filter(pk=user_id).first() if user_id else None
        if user is None:
            return Response({"detail": "Ссылка недействительна или устарела."}, status=400)
        user.is_email_confirmed = True
        user.save(update_fields=["is_email_confirmed"])
        return Response({"detail": "Email подтверждён."})


class ResendConfirmationView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        email = request.data.get("email", "")
        user = User.objects.filter(email__iexact=email, is_email_confirmed=False).first()
        if user and (
            not user.email_confirmation_sent_at or timezone.now() - user.email_confirmation_sent_at > _RESEND_COOLDOWN
        ):
            send_confirm_email(user)
        return Response({"detail": "Письмо отправлено повторно."})


class LoginView(APIView):
    """Сессионный вход с защитой от подбора пароля (ТЗ §4.6): капча с 3-й
    подряд неудачной попытки, блокировка на 5 минут после 5-й."""

    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"]
        password = serializer.validated_data["password"]
        captcha_token = serializer.validated_data["captcha_token"]

        user = User.objects.filter(email__iexact=email).first()
        if user is None:
            # Аккаунта нет — сообщение то же, что при неверном пароле, но
            # инкрементировать нечего (не палим факт отсутствия аккаунта).
            return Response({"detail": "Неверный email или пароль."}, status=400)

        now = timezone.now()
        if user.locked_until and user.locked_until > now:
            return Response(
                {
                    "detail": "Вход временно заблокирован.",
                    "locked_until": user.locked_until,
                    "retry_after": int((user.locked_until - now).total_seconds()),
                },
                status=423,
            )
        if user.locked_until and user.locked_until <= now:
            user.failed_login_attempts = 0
            user.locked_until = None

        captcha_required = user.failed_login_attempts >= _CAPTCHA_FROM_ATTEMPT and is_captcha_enabled()
        if captcha_required and not verify_captcha(captcha_token, get_client_ip(request)):
            return Response({"detail": "Подтвердите, что вы не робот.", "captcha_required": True}, status=400)

        if not user.is_active or not user.check_password(password):
            user.failed_login_attempts += 1
            if user.failed_login_attempts >= _MAX_ATTEMPTS:
                user.locked_until = now + _LOCKOUT_DURATION
                user.save(update_fields=["failed_login_attempts", "locked_until"])
                return Response(
                    {
                        "detail": "Вход временно заблокирован.",
                        "locked_until": user.locked_until,
                        "retry_after": int(_LOCKOUT_DURATION.total_seconds()),
                    },
                    status=423,
                )
            user.save(update_fields=["failed_login_attempts", "locked_until"])
            return Response(
                {
                    "detail": "Неверный email или пароль.",
                    "attempts_remaining": _MAX_ATTEMPTS - user.failed_login_attempts,
                    "captcha_required": user.failed_login_attempts >= _CAPTCHA_FROM_ATTEMPT and is_captcha_enabled(),
                },
                status=400,
            )

        user.failed_login_attempts = 0
        user.locked_until = None
        user.save(update_fields=["failed_login_attempts", "locked_until"])
        login(request, user, backend="django.contrib.auth.backends.ModelBackend")
        return Response(MeSerializer(user).data)


class LogoutView(APIView):
    def post(self, request):
        logout(request)
        return Response({"detail": "Вы вышли из системы."})


class PasswordResetRequestView(APIView):
    """Нейтральный ответ независимо от того, существует ли аккаунт (ТЗ §4.5)."""

    permission_classes = [AllowAny]
    _NEUTRAL_MESSAGE = "Если аккаунт с этим адресом существует, на него отправлена ссылка."

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = User.objects.filter(email__iexact=serializer.validated_data["email"], is_active=True).first()
        if user and (
            not user.password_reset_sent_at or timezone.now() - user.password_reset_sent_at > _RESEND_COOLDOWN
        ):
            send_password_reset(user)
            user.password_reset_sent_at = timezone.now()
            user.save(update_fields=["password_reset_sent_at"])
        return Response({"detail": self._NEUTRAL_MESSAGE})


class PasswordResetConfirmView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = SetPasswordConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]
        user.set_password(serializer.validated_data["new_password"])
        user.failed_login_attempts = 0
        user.locked_until = None
        # Прочие сессии инвалидируются автоматически: get_session_auth_hash()
        # завязан на password, Django сверяет его на каждом запросе (§4.7).
        user.save()
        return Response({"detail": "Пароль изменён."})


class AcceptInviteView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = SetPasswordConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]
        user.set_password(serializer.validated_data["new_password"])
        user.is_email_confirmed = True
        user.save()
        return Response({"detail": "Пароль установлен."})


class ChangePasswordView(APIView):
    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        user = request.user
        user.set_password(serializer.validated_data["new_password"])
        user.save()
        # Обновляет hash ТЕКУЩЕЙ сессии — остальные сессии этого пользователя
        # инвалидируются get_session_auth_hash()-проверкой (§4.7).
        update_session_auth_hash(request, user)
        return Response({"detail": "Пароль изменён."})


class ChangeEmailRequestView(APIView):
    """Профиль → смена email, шаг 1 (§3.2, §5.6): письмо со ссылкой на
    новый адрес, сам email меняется только по подтверждению перехода."""

    def post(self, request):
        serializer = ChangeEmailRequestSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        new_email = serializer.validated_data["new_email"]
        send_email_change_confirm(request.user, new_email)
        return Response({"detail": "Письмо со ссылкой для подтверждения отправлено на новый адрес."})


class ChangeEmailConfirmView(APIView):
    """Профиль → смена email, шаг 2 — переход по ссылке из письма."""

    permission_classes = [AllowAny]

    def post(self, request):
        serializer = ChangeEmailConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data["token"]
        user = User.objects.get(pk=data["user_id"])
        user.email = data["new_email"]
        user.is_email_confirmed = True
        user.save(update_fields=["email", "is_email_confirmed"])
        return Response({"detail": "Email изменён."})


class InviteView(APIView):
    """Настройки → Пользователи → «Пригласить» (ТЗ §4.4, §5.5.2) — только Администратор."""

    permission_classes = [IsAdmin]

    def post(self, request):
        serializer = InviteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # Домен email отличается от домена компании — не отправляем сразу, а
        # просим у администратора явного подтверждения (§4.4: жёсткой блокировки
        # нет, но действие должно быть осознанным).
        mismatch, company_domain = serializer.domain_mismatch()
        if mismatch and not serializer.validated_data.get("confirm_domain"):
            email_domain = serializer.validated_data["email"].rsplit("@", 1)[-1]
            return Response(
                {
                    "detail": f"Домен «{email_domain}» отличается от домена компании «{company_domain}». Всё равно отправить приглашение?",
                    "requires_domain_confirmation": True,
                },
                status=409,
            )

        # SMTPException — ошибки протокола/аутентификации; OSError — недоступный
        # порт/таймаут сокета. Пользователь при этом не создаётся (см. save() —
        # транзакция откатывается), фронт получает быстрый понятный отказ.
        try:
            serializer.save()
        except (SMTPException, OSError):
            return Response(
                {"detail": "Не удалось отправить приглашение — проверьте настройки SMTP на сервере."},
                status=502,
            )
        return Response({"detail": "Приглашение отправлено."}, status=201)


class _UserCursorPagination(ELECursorPagination):
    # User не имеет поля created_at (только date_joined) — переопределяем
    # ordering пагинатора под реальную сортировку списка (§5.5.2: без
    # предпочтения по дате, порядок как в get_queryset()).
    ordering = "email"


class UserViewSet(viewsets.ModelViewSet):
    """Настройки → Пользователи (§5.5.2) — только Администратор. Создание —
    через InviteView (пригласить), не через POST сюда; удаления нет —
    только деактивация."""

    permission_classes = [IsAdmin]
    pagination_class = _UserCursorPagination
    # DELETE не разрешаем (нет удаления, только деактивация); POST оставляем
    # разрешённым методом на уровне диспетчеризации — иначе даже кастомный
    # @action(methods=["post"]) ниже получал бы 405 — но create() ниже
    # переопределён, чтобы POST /users/ не создавал пользователя напрямую.
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_serializer_class(self):
        return UserListSerializer if self.action == "list" else UserSerializer

    def get_queryset(self):
        return User.objects.select_related("employee").order_by("email")

    def create(self, request, *args, **kwargs):
        return Response({"detail": "Пользователи создаются через /api/users/invite/."}, status=405)

    @action(detail=True, methods=["post"])
    def deactivate(self, request, pk=None):
        user = self.get_object()
        user.is_active = False
        user.save(update_fields=["is_active"])
        # Прочие сессии инвалидируются автоматически проверкой is_active в
        # ModelBackend.user_can_authenticate() (§4.7) — доп. кода не нужно.

        terminated_employee = False
        if request.data.get("terminate_employee") and user.employee_id:
            employee = user.employee
            for eq in employee.equipment.all():
                eq.employee = None
                eq.save(update_fields=["employee"])
            employee.is_employed = False
            employee.save(update_fields=["is_employed"])
            terminated_employee = True
        else:
            # «Нет» — связь снимается, Сотрудник остаётся «Работает» (§5.5.2).
            user.employee = None
            user.save(update_fields=["employee"])

        data = UserSerializer(user).data
        data["terminated_employee"] = terminated_employee
        return Response(data)

    @action(detail=True, methods=["post"])
    def activate(self, request, pk=None):
        """Обратно включить деактивированного пользователя (§5.5.2) — только
        восстанавливает вход (is_active=True). Занятость сотрудника и связь при
        необходимости управляются отдельно в разделе Сотрудники."""
        user = self.get_object()
        user.is_active = True
        user.save(update_fields=["is_active"])
        return Response(UserSerializer(user).data)


class YandexIDAuthorizeView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        if not is_yandex_id_enabled():
            return Response({"detail": "Вход через Яндекс ID не настроен."}, status=404)
        state = make_state()
        request.session["yandex_oauth_state"] = state
        return HttpResponseRedirect(build_authorize_url(state))


class YandexIDCallbackView(APIView):
    """Обмен code на access_token и вход/регистрация по email (ТЗ §4.3).

    Отдельной модели связки не требуется — совпадение email само по себе
    является привязкой между Яндекс ID и учётной записью ELE."""

    permission_classes = [AllowAny]

    def get(self, request):
        def fail(reason: str):
            return HttpResponseRedirect(f"{settings.SITE_URL}/login?yandex_error={reason}")

        if not is_yandex_id_enabled():
            return fail("disabled")

        state = request.GET.get("state")
        if not state or state != request.session.pop("yandex_oauth_state", None):
            return fail("state")

        code = request.GET.get("code")
        access_token = exchange_code_for_token(code) if code else None
        if not access_token:
            return fail("token")

        info = fetch_user_info(access_token)
        if not info:
            return fail("email")
        email = info["email"]

        from company.models import Company
        from employees.models import Employee

        company = Company.load()
        if company.domain and email.rsplit("@", 1)[-1].lower() != company.domain.lower():
            # Вход отклоняется без исключений при несовпадении домена (§4.3).
            return fail("domain")

        user = User.objects.filter(email__iexact=email).first()
        if user is None:
            # Первый вход — заводим учётку и связанного Сотрудника (§3.3) из
            # имени/фамилии Яндекса; если их нет — в оба поля логин (до @).
            login_part = email.split("@", 1)[0]
            with transaction.atomic():
                employee = Employee.objects.create(
                    first_name=info["first_name"] or login_part,
                    last_name=info["last_name"] or login_part,
                )
                user = User(
                    email=email, role=User.Role.EMPLOYEE, is_email_confirmed=True, employee=employee
                )
                user.set_unusable_password()
                user.save()
        elif not user.is_active:
            return fail("inactive")
        elif not user.is_email_confirmed:
            user.is_email_confirmed = True
            user.save(update_fields=["is_email_confirmed"])

        login(request, user, backend="django.contrib.auth.backends.ModelBackend")
        return HttpResponseRedirect(f"{settings.SITE_URL}/")
