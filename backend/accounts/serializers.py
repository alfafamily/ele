from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from employees.models import Employee
from employees.serializers import EmployeeListSerializer

from .tokens import get_user_from_uid, set_password_token_generator

User = get_user_model()


class MeSerializer(serializers.ModelSerializer):
    """Профиль (§5.6) — employee вложен целиком (не просто id), иначе роль
    «Сотрудник» не смогла бы прочитать свои же Имя/Фамилию/Отдел/Аватар:
    EmployeeViewSet закрыт для этой роли (§2.3), а тут — про себя, не про
    список чужих объектов."""

    employee = EmployeeListSerializer(read_only=True)

    class Meta:
        model = User
        fields = ["id", "email", "role", "is_observer", "employee", "is_email_confirmed", "date_joined", "password_changed_at"]


class UserListSerializer(serializers.ModelSerializer):
    """Настройки → Пользователи, список (§5.5.2)."""

    status = serializers.SerializerMethodField()
    employee_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "email", "role", "is_observer", "status", "employee", "employee_name"]

    def get_status(self, obj):
        if not obj.is_active:
            return "deactivated"
        if not obj.is_email_confirmed:
            return "invited"
        return "active"

    def get_employee_name(self, obj):
        return str(obj.employee) if obj.employee_id else None


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "email", "role", "is_observer", "employee", "is_active", "is_email_confirmed", "date_joined"]
        read_only_fields = ["email", "is_active", "is_email_confirmed", "date_joined"]

    def validate(self, attrs):
        role = attrs.get("role", getattr(self.instance, "role", None))
        is_observer = attrs.get("is_observer", getattr(self.instance, "is_observer", False))
        if is_observer and role != User.Role.EMPLOYEE:
            raise serializers.ValidationError(
                {"is_observer": ["Признак «Наблюдатель» применим только к роли «Сотрудник»."]}
            )
        return attrs


class RegisterSerializer(serializers.Serializer):
    """Самостоятельная регистрация (ТЗ §4.2) — роль «Сотрудник» по умолчанию,
    без привязки к Сотруднику."""

    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)
    password_repeat = serializers.CharField(write_only=True)

    def validate_email(self, value):
        value = User.objects.normalize_email(value)
        from company.models import Company

        company = Company.load()
        if company.domain:
            domain = value.rsplit("@", 1)[-1].lower()
            if domain != company.domain.lower():
                raise serializers.ValidationError("Домен email не совпадает с доменом компании.")

        existing = User.objects.filter(email__iexact=value).first()
        if existing:
            if existing.is_email_confirmed:
                raise serializers.ValidationError("Пользователь с таким email уже зарегистрирован.")
            if existing.invite_sent_at is not None:
                # Приглашённый администратором аккаунт — самостоятельная
                # регистрация не должна перехватывать его (§4.4 vs §4.2).
                raise serializers.ValidationError(
                    "На этот email отправлено приглашение — используйте ссылку из письма."
                )
        return value

    def validate(self, attrs):
        if attrs["password"] != attrs["password_repeat"]:
            raise serializers.ValidationError({"password_repeat": ["Пароли не совпадают."]})
        validate_password(attrs["password"])
        return attrs

    def save(self):
        email = self.validated_data["email"]
        # Незавершённая предыдущая самостоятельная регистрация тем же email —
        # переиспользуем запись, не плодим дубликаты (см. validate_email).
        user = User.objects.filter(email__iexact=email, is_email_confirmed=False).first()
        if user is None:
            user = User(email=email, role=User.Role.EMPLOYEE)
        user.set_password(self.validated_data["password"])
        user.save()
        return user


class InviteSerializer(serializers.Serializer):
    """Приглашение пользователя администратором (ТЗ §4.4)."""

    email = serializers.EmailField()
    role = serializers.ChoiceField(choices=User.Role.choices)
    employee_id = serializers.PrimaryKeyRelatedField(
        source="employee", queryset=Employee.objects.all(), required=False, allow_null=True
    )
    is_observer = serializers.BooleanField(required=False, default=False)
    # Явное подтверждение отправки при несовпадении домена (§4.4) — без него
    # при несовпадении домена приглашение не отправляется, а запрашивается
    # подтверждение у администратора.
    confirm_domain = serializers.BooleanField(required=False, default=False)

    def domain_mismatch(self):
        from company.models import Company

        company = Company.load()
        email = self.validated_data["email"]
        return bool(company.domain and email.rsplit("@", 1)[-1].lower() != company.domain.lower()), company.domain

    def validate(self, attrs):
        if attrs.get("is_observer") and attrs["role"] != User.Role.EMPLOYEE:
            raise serializers.ValidationError(
                {"is_observer": ["Признак «Наблюдатель» применим только к роли «Сотрудник»."]}
            )
        existing = User.objects.filter(email__iexact=attrs["email"]).first()
        if existing and existing.is_email_confirmed:
            raise serializers.ValidationError({"email": ["Пользователь уже зарегистрирован."]})
        return attrs

    def save(self):
        from company.models import Company

        from .emails import send_invite

        email = self.validated_data["email"]
        domain_warning = None
        company = Company.load()
        if company.domain and email.rsplit("@", 1)[-1].lower() != company.domain.lower():
            # Жёсткой блокировки нет — только предупреждение (§4.4).
            domain_warning = "Домен email отличается от домена компании."

        fields = {
            "role": self.validated_data["role"],
            "is_observer": self.validated_data.get("is_observer", False),
            "employee": self.validated_data.get("employee"),
        }
        user = User.objects.filter(email__iexact=email).first()
        if user:
            for key, value in fields.items():
                setattr(user, key, value)
            user.save()
        else:
            user = User(email=email, is_email_confirmed=False, **fields)
            user.set_unusable_password()
            user.save()

        send_invite(user)
        return user, domain_warning


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)
    captcha_token = serializers.CharField(required=False, allow_blank=True, default="")


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class SetPasswordConfirmSerializer(serializers.Serializer):
    """Общая проверка uid+token для приглашения и сброса пароля (оба
    построены на django.contrib.auth.tokens.PasswordResetTokenGenerator)."""

    uid = serializers.CharField()
    token = serializers.CharField()
    new_password = serializers.CharField(write_only=True)
    new_password_repeat = serializers.CharField(write_only=True)

    def validate(self, attrs):
        user = get_user_from_uid(attrs["uid"], User)
        if user is None or not set_password_token_generator.check_token(user, attrs["token"]):
            raise serializers.ValidationError({"token": ["Ссылка недействительна или устарела."]})
        if attrs["new_password"] != attrs["new_password_repeat"]:
            raise serializers.ValidationError({"new_password_repeat": ["Пароли не совпадают."]})
        validate_password(attrs["new_password"], user=user)
        attrs["user"] = user
        return attrs


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True)
    new_password_repeat = serializers.CharField(write_only=True)

    def validate(self, attrs):
        user = self.context["request"].user
        if not user.check_password(attrs["current_password"]):
            raise serializers.ValidationError({"current_password": ["Неверный текущий пароль."]})
        if attrs["new_password"] != attrs["new_password_repeat"]:
            raise serializers.ValidationError({"new_password_repeat": ["Пароли не совпадают."]})
        validate_password(attrs["new_password"], user=user)
        return attrs


class ChangeEmailRequestSerializer(serializers.Serializer):
    """Смена email из Профиля (§3.2, §5.6) — повторная валидация домена,
    подтверждение по ссылке (сам email меняется только в ChangeEmailConfirmView)."""

    new_email = serializers.EmailField()

    def validate_new_email(self, value):
        value = User.objects.normalize_email(value)
        request_user = self.context["request"].user
        from company.models import Company

        company = Company.load()
        if company.domain:
            domain = value.rsplit("@", 1)[-1].lower()
            if domain != company.domain.lower():
                raise serializers.ValidationError("Домен email не совпадает с доменом компании.")
        if User.objects.filter(email__iexact=value).exclude(pk=request_user.pk).exists():
            raise serializers.ValidationError("Этот email уже используется другой учётной записью.")
        return value


class ChangeEmailConfirmSerializer(serializers.Serializer):
    token = serializers.CharField()

    def validate_token(self, value):
        from .tokens import read_email_change_token

        data = read_email_change_token(value, max_age=60 * 60 * 24)  # 24 часа, как приглашение/сброс пароля
        if data is None:
            raise serializers.ValidationError("Ссылка недействительна или устарела.")
        if User.objects.filter(email__iexact=data["new_email"]).exclude(pk=data["user_id"]).exists():
            raise serializers.ValidationError("Этот email уже используется другой учётной записью.")
        return data
