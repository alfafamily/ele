from datetime import datetime, timedelta
from smtplib import SMTPException

from django.conf import settings
from django.contrib.auth import get_user_model, login
from django.db import transaction
from django.utils import timezone
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.captcha import is_captcha_enabled, verify_captcha
from accounts.yandex_oauth import is_yandex_id_enabled
from core.permissions import IsAdmin
from core.utils.client_ip import get_client_ip
from storage.backends import target_backend_name
from storage.models import StoredFile
from storage.serializers import StoredFileErrorSerializer, StoredFileSerializer
from storage.service import delete_stored_file, store_uploaded_file
from storage.validators import validate_image_max_dimensions

from .integration_checks import check_smartcaptcha_reachable, check_yandex_oauth_reachable
from .models import Company
from .serializers import (
    BackupSettingsSerializer,
    CompanyBriefSerializer,
    CompanySettingsSerializer,
    SetupCompleteSerializer,
    StorageModeSerializer,
    TestEmailRequestSerializer,
    VerifyEmailCodeSerializer,
)
from .setup_email import CODE_TTL_SECONDS, generate_code, send_test_code_email
from .storage_test import storage_selftest, test_s3_connection

User = get_user_model()

_SESSION_STORAGE_VERIFIED = "setup_storage_verified"
_SESSION_EMAIL_VERIFIED = "setup_email_verified"  # подтверждённый email (строка) или отсутствует
_SESSION_EMAIL_PENDING = "setup_email_pending"  # {"email", "code", "sent_at"}
_SESSION_SMTP_TEST_PENDING = "company_smtp_test_pending"  # проверка SMTP из Настроек → Компания
_SESSION_CAPTCHA_VERIFIED = "setup_captcha_verified"
_SESSION_YANDEX_VERIFIED = "setup_yandex_verified"


def _setup_required() -> bool:
    return not User.objects.filter(role=User.Role.ADMIN).exists()


def _s3_env_configured() -> bool:
    return all(
        [settings.S3_ENDPOINT, settings.S3_BUCKET, settings.S3_REGION, settings.S3_ACCESS_KEY, settings.S3_SECRET_KEY]
    )


def _guard(request):
    """Общая для всех эндпоинтов мастера проверка: работают только пока
    в системе нет ни одного Администратора."""
    if not _setup_required():
        return Response({"detail": "Настройка уже завершена."}, status=403)
    return None


class CompanyBriefView(APIView):
    """Название + лого для навигации (§8.5) — видно всем аутентифицированным
    ролям, в отличие от полной карточки Настройки → Компания (только Admin)."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(CompanyBriefSerializer(Company.load()).data)


class CompanySettingsView(APIView):
    """Настройки → Компания (§5.5.1) — основные реквизиты, домен, IP-allowlist.
    Только Администратор; режим хранилища/лого/бэкап — отдельные эндпоинты."""

    permission_classes = [IsAdmin]

    def get(self, request):
        return Response(CompanySettingsSerializer(Company.load()).data)

    def patch(self, request):
        company = Company.load()
        serializer = CompanySettingsSerializer(company, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class EnvironmentStatusView(APIView):
    """Что сейчас задано в .env контейнера — для шага 3 мастера. Только
    просмотр: ввода S3/почты/капчи/Яндекс ID через UI нет (ТЗ §4.1 vs §8.6,
    backend не пишет в .env)."""

    permission_classes = [AllowAny]

    def get(self, request):
        guard = _guard(request)
        if guard:
            return guard
        return Response(
            {
                "storage": {
                    "mode": settings.ELE_STORAGE_MODE,
                    "endpoint": settings.S3_ENDPOINT or None,
                    "bucket": settings.S3_BUCKET or None,
                    "region": settings.S3_REGION or None,
                    "configured": settings.ELE_STORAGE_MODE == Company.StorageMode.LOCAL or _s3_env_configured(),
                    "verified": bool(request.session.get(_SESSION_STORAGE_VERIFIED)),
                },
                "email": {
                    "configured": settings.EMAIL_CONFIGURED,
                    "host": settings.EMAIL_HOST if settings.EMAIL_CONFIGURED else None,
                    "verified_email": request.session.get(_SESSION_EMAIL_VERIFIED),
                },
                "captcha": {
                    "configured": is_captcha_enabled(),
                    "verified": bool(request.session.get(_SESSION_CAPTCHA_VERIFIED)),
                },
                "yandex_id": {
                    "configured": is_yandex_id_enabled(),
                    "verified": bool(request.session.get(_SESSION_YANDEX_VERIFIED)),
                },
            }
        )


class TestStorageConnectionView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        guard = _guard(request)
        if guard:
            return guard
        if settings.ELE_STORAGE_MODE != Company.StorageMode.S3:
            request.session[_SESSION_STORAGE_VERIFIED] = True
            return Response({"detail": "Локальное хранилище всегда доступно."})
        if not _s3_env_configured():
            return Response({"detail": "В .env заданы не все параметры S3."}, status=400)
        ok, error = test_s3_connection(
            {
                "endpoint": settings.S3_ENDPOINT,
                "bucket": settings.S3_BUCKET,
                "region": settings.S3_REGION,
                "access_key": settings.S3_ACCESS_KEY,
                "secret_key": settings.S3_SECRET_KEY,
            }
        )
        request.session[_SESSION_STORAGE_VERIFIED] = ok
        if not ok:
            return Response({"detail": error}, status=400)
        return Response({"detail": "Подключение успешно."})


class TestEmailView(APIView):
    """Шлёт код на указанный email — ввод этого кода в VerifyEmailCodeView и
    есть доказательство, что письма реально доходят (не просто "send() не упал")."""

    permission_classes = [AllowAny]

    def post(self, request):
        guard = _guard(request)
        if guard:
            return guard
        if not settings.EMAIL_CONFIGURED:
            return Response({"detail": "SMTP не настроен в .env."}, status=400)
        serializer = TestEmailRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"]
        code = generate_code()
        try:
            send_test_code_email(email, code)
        except Exception:
            return Response(
                {"detail": "Не удалось отправить письмо — проверьте настройки SMTP в .env."}, status=400
            )
        request.session[_SESSION_EMAIL_PENDING] = {"email": email, "code": code, "sent_at": timezone.now().isoformat()}
        request.session.pop(_SESSION_EMAIL_VERIFIED, None)
        return Response({"detail": "Письмо с кодом отправлено."})


class VerifyEmailCodeView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        guard = _guard(request)
        if guard:
            return guard
        serializer = VerifyEmailCodeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        pending = request.session.get(_SESSION_EMAIL_PENDING)
        if not pending:
            return Response({"detail": "Сначала запросите код подтверждения."}, status=400)
        sent_at = datetime.fromisoformat(pending["sent_at"])
        if timezone.now() - sent_at > timedelta(seconds=CODE_TTL_SECONDS):
            return Response({"detail": "Код устарел, запросите новый."}, status=400)
        if serializer.validated_data["code"] != pending["code"]:
            return Response({"detail": "Неверный код."}, status=400)
        request.session[_SESSION_EMAIL_VERIFIED] = pending["email"]
        request.session.pop(_SESSION_EMAIL_PENDING, None)
        return Response({"detail": "Почта подтверждена."})


class CompanyTestEmailView(APIView):
    """Настройки → Компания → «Проверить SMTP» (аналог мастера §4.1, шаг 3, но
    для уже работающей системы). Шлёт код на почту текущего администратора;
    подтверждение кода в CompanyVerifyEmailView доказывает, что письма реально
    доходят, а не только что send() не упал. Только Администратор."""

    permission_classes = [IsAdmin]

    def post(self, request):
        if not settings.EMAIL_CONFIGURED:
            return Response({"detail": "SMTP не настроен в .env."}, status=400)
        email = request.user.email
        code = generate_code()
        try:
            send_test_code_email(email, code)
        except (SMTPException, OSError):
            return Response(
                {"detail": "Не удалось отправить письмо — проверьте настройки SMTP в .env."}, status=400
            )
        request.session[_SESSION_SMTP_TEST_PENDING] = {
            "email": email,
            "code": code,
            "sent_at": timezone.now().isoformat(),
        }
        return Response({"detail": f"Письмо с кодом отправлено на {email}.", "email": email})


class CompanyVerifyEmailView(APIView):
    """Подтверждение кода из письма проверки SMTP (см. CompanyTestEmailView)."""

    permission_classes = [IsAdmin]

    def post(self, request):
        serializer = VerifyEmailCodeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        pending = request.session.get(_SESSION_SMTP_TEST_PENDING)
        if not pending:
            return Response({"detail": "Сначала отправьте проверочное письмо."}, status=400)
        sent_at = datetime.fromisoformat(pending["sent_at"])
        if timezone.now() - sent_at > timedelta(seconds=CODE_TTL_SECONDS):
            return Response({"detail": "Код устарел, отправьте письмо заново."}, status=400)
        if serializer.validated_data["code"] != pending["code"]:
            return Response({"detail": "Неверный код."}, status=400)
        request.session.pop(_SESSION_SMTP_TEST_PENDING, None)
        return Response({"detail": "SMTP работает — письмо доставлено."})


class SystemStatusView(APIView):
    """Настройки → Системные: какие интеграции сконфигурированы в .env — чтобы
    фронт показывал кнопку «Выполнить проверку» либо примечание «не задано»."""

    permission_classes = [IsAdmin]

    def get(self, request):
        return Response(
            {
                "storage_mode": Company.load().storage_mode,
                "s3_configured": _s3_env_configured(),
                "email_configured": settings.EMAIL_CONFIGURED,
                "yandex_id_configured": is_yandex_id_enabled(),
                "captcha_configured": is_captcha_enabled(),
                "captcha_site_key": settings.YANDEX_SMARTCAPTCHA_SITE_KEY or None,
            }
        )


class CompanyStorageTestView(APIView):
    """Проверка активного хранилища: запись/чтение/удаление test_file.txt (§8.3)."""

    permission_classes = [IsAdmin]

    def post(self, request):
        if target_backend_name() == "s3" and not _s3_env_configured():
            return Response({"detail": "S3 не настроен в .env."}, status=400)
        ok, error = storage_selftest()
        if not ok:
            return Response({"detail": error or "Проверка не пройдена."}, status=400)
        return Response({"detail": "Хранилище работает — тестовый файл записан и удалён."})


class CompanyYandexIDCheckView(APIView):
    """Проверка доступности Яндекс ID по заданным в .env реквизитам (§4.3)."""

    permission_classes = [IsAdmin]

    def post(self, request):
        if not is_yandex_id_enabled():
            return Response({"detail": "Яндекс ID не настроен в .env."}, status=400)
        if not check_yandex_oauth_reachable():
            return Response({"detail": "Эндпоинт Яндекс ID недоступен — проверьте сеть."}, status=400)
        return Response({"detail": "Яндекс ID доступен."})


class CompanyCaptchaCheckView(APIView):
    """Проверка SmartCaptcha (§4.6): админ решает капчу на странице, сюда
    приходит токен — валидируем серверным ключом (это реальная проверка
    ключей, а не только доступность эндпоинта)."""

    permission_classes = [IsAdmin]

    def post(self, request):
        if not is_captcha_enabled():
            return Response({"detail": "SmartCaptcha не настроена в .env."}, status=400)
        token = request.data.get("token") or ""
        if not token:
            return Response({"detail": "Сначала решите капчу."}, status=400)
        if not verify_captcha(token, get_client_ip(request)):
            return Response({"detail": "Капча не пройдена — проверьте ключи в .env."}, status=400)
        return Response({"detail": "Капча пройдена — ключи рабочие."})


class TestCaptchaView(APIView):
    """Только доступность эндпоинта SmartCaptcha — не валидность ключей
    (для этого нужен решённый пользователем токен, недостижимо с бэкенда)."""

    permission_classes = [AllowAny]

    def post(self, request):
        guard = _guard(request)
        if guard:
            return guard
        if not is_captcha_enabled():
            return Response({"detail": "SmartCaptcha не настроена в .env."}, status=400)
        ok = check_smartcaptcha_reachable()
        request.session[_SESSION_CAPTCHA_VERIFIED] = ok
        if not ok:
            return Response({"detail": "Эндпоинт SmartCaptcha недоступен — проверьте сеть и ключи в .env."}, status=400)
        return Response({"detail": "Эндпоинт SmartCaptcha доступен (базовая проверка, не гарантия валидности ключей)."})


class TestYandexIDView(APIView):
    """Только доступность эндпоинта OAuth — не валидность client_id/secret
    (для этого нужен пройденный пользователем consent, недостижимо с бэкенда)."""

    permission_classes = [AllowAny]

    def post(self, request):
        guard = _guard(request)
        if guard:
            return guard
        if not is_yandex_id_enabled():
            return Response({"detail": "Яндекс ID не настроен в .env."}, status=400)
        ok = check_yandex_oauth_reachable()
        request.session[_SESSION_YANDEX_VERIFIED] = ok
        if not ok:
            return Response({"detail": "Эндпоинт Яндекс OAuth недоступен — проверьте сеть и ключи в .env."}, status=400)
        return Response({"detail": "Эндпоинт Яндекс OAuth доступен (базовая проверка, не гарантия валидности ключей)."})


class SetupCompleteView(APIView):
    """Setup Wizard, финальный шаг (ТЗ §4.1). Блокируется, если хоть одна
    НАСТРОЕННАЯ в .env (не пустая) интеграция не была успешно проверена в
    этой же сессии — просит поправить .env/сеть и повторить проверку."""

    permission_classes = [AllowAny]

    def post(self, request):
        guard = _guard(request)
        if guard:
            return guard

        serializer = SetupCompleteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        admin_email = data["admin"]["email"]

        blockers = []
        if settings.ELE_STORAGE_MODE == Company.StorageMode.S3 and not request.session.get(_SESSION_STORAGE_VERIFIED):
            blockers.append("Не подтверждено подключение к S3 — нажмите «Проверить подключение».")
        if settings.EMAIL_CONFIGURED:
            verified_email = request.session.get(_SESSION_EMAIL_VERIFIED)
            if verified_email is None:
                blockers.append("Не подтверждена доставка почты — запросите и введите код подтверждения.")
            elif verified_email.lower() != admin_email.lower():
                blockers.append(
                    "Код подтверждения был отправлен на другой email — проверьте почту ещё раз для этого адреса."
                )
        if is_captcha_enabled() and not request.session.get(_SESSION_CAPTCHA_VERIFIED):
            blockers.append("Не подтверждена доступность SmartCaptcha.")
        if is_yandex_id_enabled() and not request.session.get(_SESSION_YANDEX_VERIFIED):
            blockers.append("Не подтверждена доступность Яндекс OAuth.")

        if blockers:
            return Response({"errors": {"non_field_errors": blockers}}, status=400)

        with transaction.atomic():
            admin = User.objects.create_superuser(email=admin_email, password=data["admin"]["password"])
            company = Company.load()
            company.name = data["company"]["name"]
            company.inn = data["company"]["inn"]
            company.kpp = data["company"]["kpp"]
            company.storage_mode = settings.ELE_STORAGE_MODE
            company.save()

        for key in (
            _SESSION_STORAGE_VERIFIED,
            _SESSION_EMAIL_VERIFIED,
            _SESSION_EMAIL_PENDING,
            _SESSION_CAPTCHA_VERIFIED,
            _SESSION_YANDEX_VERIFIED,
        ):
            request.session.pop(key, None)

        login(request, admin, backend="django.contrib.auth.backends.ModelBackend")
        return Response({"detail": "Настройка завершена."}, status=201)


class StorageModeUpdateView(APIView):
    """Настройки → Компания: смена режима хранилища (ТЗ §3.1, §8.3). Сама
    смена мгновенна — перенос уже загруженных файлов забирает cron
    (storage/management/commands/migrate_storage_files.py) по расписанию."""

    permission_classes = [IsAdmin]

    def get(self, request):
        return Response(StorageModeSerializer(Company.load()).data)

    def patch(self, request):
        company = Company.load()
        serializer = StorageModeSerializer(company, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        if serializer.validated_data["storage_mode"] == Company.StorageMode.S3:
            missing = [k for k in ("S3_ENDPOINT", "S3_BUCKET", "S3_REGION", "S3_ACCESS_KEY", "S3_SECRET_KEY") if not getattr(settings, k)]
            if missing:
                return Response(
                    {"detail": f"В .env не заданы параметры S3: {', '.join(missing)}."}, status=400
                )
        serializer.save()
        return Response(serializer.data)


class StorageMigrationStatusView(APIView):
    """Экран S2 (Настройки → Компания) — статус переноса файлов (ТЗ §8.3)."""

    permission_classes = [IsAdmin]

    def get(self, request):
        target = target_backend_name()
        pending_qs = StoredFile.objects.exclude(backend=target).exclude(
            migration_status=StoredFile.MigrationStatus.ERROR
        )
        error_qs = StoredFile.objects.exclude(backend=target).filter(migration_status=StoredFile.MigrationStatus.ERROR)
        pending_count = pending_qs.count()
        error_count = error_qs.count()
        if pending_count == 0 and error_count == 0:
            status_value = "idle"
        elif pending_count == 0:
            status_value = "error"
        else:
            status_value = "in_progress"
        return Response(
            {
                "target_backend": target,
                "status": status_value,
                # Точный "N из M" не считаем — при таком масштабе (§7.1)
                # оставшееся количество даёт ту же практическую пользу без
                # хрупкого учёта исходного размера партии на момент переключения.
                "pending_count": pending_count,
                "error_count": error_count,
                "errors": StoredFileErrorSerializer(error_qs, many=True).data,
            }
        )


class StorageMigrationRetryView(APIView):
    """Повторный запуск переноса только по файлам с ошибкой (ТЗ §8.3)."""

    permission_classes = [IsAdmin]

    def post(self, request):
        target = target_backend_name()
        updated = StoredFile.objects.exclude(backend=target).filter(
            migration_status=StoredFile.MigrationStatus.ERROR
        ).update(migration_status=StoredFile.MigrationStatus.NONE, migration_error="")
        return Response({"detail": f"Повторный перенос запланирован для {updated} файлов."})


class CompanyLogoUploadView(APIView):
    """Настройки → Компания: логотип (ТЗ §3.1). Не более 600×600, файл
    сохраняется в текущее целевое хранилище компании (§8.3)."""

    permission_classes = [IsAdmin]

    def post(self, request):
        file_obj = request.FILES.get("file")
        if not file_obj:
            return Response({"detail": "Файл не передан."}, status=400)
        try:
            validate_image_max_dimensions(file_obj, 600, 600)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=400)

        company = Company.load()
        old_logo = company.logo
        company.logo = store_uploaded_file(file_obj, "company")
        company.save(update_fields=["logo"])
        delete_stored_file(old_logo)
        return Response(StoredFileSerializer(company.logo).data)

    def delete(self, request):
        company = Company.load()
        old_logo = company.logo
        company.logo = None
        company.save(update_fields=["logo"])
        delete_stored_file(old_logo)
        return Response(status=204)


class BackupSettingsView(APIView):
    """Настройки → Резервное копирование: тумблер/расписание/глубина
    хранения автокопирования (ТЗ §5.5.3). Сам запуск — cron (backup/
    service.py run_scheduled_backup_if_due), не этот эндпоинт."""

    permission_classes = [IsAdmin]

    def get(self, request):
        return Response(BackupSettingsSerializer(Company.load()).data)

    def patch(self, request):
        company = Company.load()
        serializer = BackupSettingsSerializer(company, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)
