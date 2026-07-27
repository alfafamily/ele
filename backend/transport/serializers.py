from django.db import transaction
from rest_framework import serializers

from core.eav import apply_field_values, missing_required_fields, upsert_custom_fields
from storage.serializers import StoredFileSerializer

from .maintenance import create_plans_for_transport, transport_maintenance_summary
from .models import (
    BASE_FIELD_MODEL,
    BASE_FIELD_PLATE,
    MaintenanceKind,
    MaintenanceRegulation,
    MaintenanceRegulationItem,
    Transport,
    TransportCustomField,
    TransportFieldFile,
    TransportFieldValue,
    TransportType,
    TransportTypeField,
    TransportTypeFieldOption,
)


class TransportTypeFieldOptionSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(required=False)

    class Meta:
        model = TransportTypeFieldOption
        fields = ["id", "value", "order"]


class TransportTypeFieldSerializer(serializers.ModelSerializer):
    options = TransportTypeFieldOptionSerializer(many=True, required=False)

    class Meta:
        model = TransportTypeField
        fields = ["id", "transport_type", "name", "value_type", "is_required", "allow_multiple", "is_locked", "order", "options"]
        read_only_fields = ["transport_type", "is_locked", "order"]

    def validate(self, attrs):
        # Базовые реквизиты («Модель»/«Гос.номер») — нельзя переименовать/сделать
        # обязательным.
        if self.instance and self.instance.is_locked:
            if "name" in attrs and attrs["name"] != self.instance.name:
                raise serializers.ValidationError({"name": [f"Базовый реквизит «{self.instance.name}» нельзя переименовать."]})
            if attrs.get("is_required"):
                raise serializers.ValidationError({"is_required": [f"Базовый реквизит «{self.instance.name}» нельзя сделать обязательным."]})
        return attrs

    def create(self, validated_data):
        options = validated_data.pop("options", None)
        field = super().create(validated_data)
        if options is not None:
            self._sync_options(field, options)
        return field

    def update(self, instance, validated_data):
        options = validated_data.pop("options", None)
        field = super().update(instance, validated_data)
        if options is not None:
            self._sync_options(field, options)
        return field

    def _sync_options(self, field, options):
        field.options.all().delete()
        for i, opt in enumerate(options):
            value = (opt.get("value") or "").strip()
            if not value:
                continue
            TransportTypeFieldOption.objects.create(field=field, value=value, order=opt.get("order", i))


class TransportTypeSerializer(serializers.ModelSerializer):
    fields = TransportTypeFieldSerializer(many=True, read_only=True)
    objects_count = serializers.IntegerField(source="transport.count", read_only=True)

    class Meta:
        model = TransportType
        fields = ["id", "name", "is_archived", "mileage_unit", "gibdd_registration", "fields", "objects_count"]
        # gibdd_registration определяет состав базовых реквизитов и задаётся только
        # при создании (как вид лицензии) — после создания неизменяем.
        read_only_fields = []

    def update(self, instance, validated_data):
        # Запрет смены признака регистрации в ГИБДД после создания.
        if "gibdd_registration" in validated_data and validated_data["gibdd_registration"] != instance.gibdd_registration:
            raise serializers.ValidationError(
                {"gibdd_registration": ["Признак регистрации в ГИБДД нельзя изменить после создания типа."]}
            )
        return super().update(instance, validated_data)


class TransportFieldValueInputSerializer(serializers.Serializer):
    field = serializers.PrimaryKeyRelatedField(queryset=TransportTypeField.objects.all())
    value = serializers.JSONField(required=False, allow_null=True)


class TransportFieldFileSerializer(serializers.ModelSerializer):
    file = StoredFileSerializer(source="stored_file", read_only=True)

    class Meta:
        model = TransportFieldFile
        fields = ["id", "file"]


class TransportFieldValueOutSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source="field.name", read_only=True)
    value_type = serializers.CharField(source="field.value_type", read_only=True)
    allow_multiple = serializers.BooleanField(source="field.allow_multiple", read_only=True)
    field_order = serializers.IntegerField(source="field.order", read_only=True)
    value = serializers.SerializerMethodField()
    value_file = StoredFileSerializer(read_only=True)
    value_files = TransportFieldFileSerializer(source="files", many=True, read_only=True)

    class Meta:
        model = TransportFieldValue
        fields = ["field", "name", "value_type", "allow_multiple", "field_order", "value", "value_file", "value_files"]

    def get_value(self, obj):
        vt = obj.field.value_type
        if vt == "file":
            return None
        if vt == "list":
            return obj.value_text
        return getattr(obj, f"value_{vt}")


class TransportCustomFieldSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(required=False)

    class Meta:
        model = TransportCustomField
        fields = ["id", "name", "value"]


def _locked_value(obj, name):
    """Значение базового залоченного реквизита (Модель/Гос.номер) объекта."""
    return next(
        (fv.value_text for fv in obj.field_values.all() if fv.field.is_locked and fv.field.name == name),
        None,
    )


def transport_parking(obj):
    """Текущая парковка транспорта: закреплённое парковочное место (с планом
    парковки), либо «на адресе сотрудника», либо None. Место одно — уникальность
    гарантирована при закреплении. Требует prefetch parking_spots__room."""
    spot = next((p for p in obj.parking_spots.all() if not p.is_archived), None)
    if spot is not None:
        plan = getattr(spot.room, "plan_file", None)
        return {
            "kind": "spot",
            "place": spot.id,
            "place_name": spot.name,
            "room_name": spot.room.name,
            "building_name": spot.room.building.name,
            "requires_pass": spot.requires_pass,
            "plan_file": StoredFileSerializer(plan).data if plan else None,
        }
    if obj.parks_at_driver_address:
        return {"kind": "driver_address"}
    return None


class TransportSerializer(serializers.ModelSerializer):
    """Единый сериализатор чтения/записи. Файловые реквизиты — через отдельный
    upload-эндпоинт (см. views.py)."""

    inventory_number = serializers.CharField(max_length=255)
    transport_type_name = serializers.CharField(source="transport_type.name", read_only=True)
    type_mileage_unit = serializers.CharField(source="transport_type.mileage_unit", read_only=True)
    type_gibdd_registration = serializers.BooleanField(source="transport_type.gibdd_registration", read_only=True)
    maintenance_summary = serializers.SerializerMethodField()
    type_and_model = serializers.SerializerMethodField()
    plate = serializers.SerializerMethodField()
    last_mileage = serializers.SerializerMethodField()
    employee_name = serializers.SerializerMethodField()
    employee_avatar = serializers.SerializerMethodField()
    department = serializers.SerializerMethodField()
    position = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()
    parking = serializers.SerializerMethodField()
    field_values = TransportFieldValueOutSerializer(many=True, read_only=True)
    custom_fields = TransportCustomFieldSerializer(many=True, required=False)
    field_values_input = TransportFieldValueInputSerializer(many=True, required=False, write_only=True)

    class Meta:
        model = Transport
        fields = [
            "id",
            "inventory_number",
            "employee",
            "employee_name",
            "employee_avatar",
            "department",
            "position",
            "is_written_off",
            "written_off_at",
            "parks_at_driver_address",
            "transport_type",
            "transport_type_name",
            "type_mileage_unit",
            "type_gibdd_registration",
            "maintenance_summary",
            "type_and_model",
            "plate",
            "last_mileage",
            "status",
            "parking",
            "field_values",
            "field_values_input",
            "custom_fields",
            "created_at",
        ]
        read_only_fields = ["is_written_off", "written_off_at", "created_at", "parks_at_driver_address"]

    def get_parking(self, obj):
        return transport_parking(obj)

    def get_type_and_model(self, obj):
        model_value = _locked_value(obj, BASE_FIELD_MODEL)
        return f"{obj.transport_type.name} {model_value}" if model_value else obj.transport_type.name

    def get_plate(self, obj):
        return _locked_value(obj, BASE_FIELD_PLATE)

    def get_last_mileage(self, obj):
        # Текущий (максимальный зафиксированный при ТО) пробег/моточасы — одометр
        # только растёт, поэтому берём максимум, а не последнюю по времени запись
        # (устойчиво к порядку ввода). Не считаем в списке (N+1); на карточке — да.
        view = self.context.get("view")
        if getattr(view, "action", None) == "list":
            return None
        rec = (
            obj.maintenance_records.filter(mileage__isnull=False)
            .order_by("-mileage", "-performed_at", "-id")
            .first()
        )
        if rec is None:
            return None
        return {
            "value": rec.mileage,
            "unit": obj.transport_type.mileage_unit,
            "performed_at": rec.performed_at,
        }

    def get_employee_name(self, obj):
        return str(obj.employee) if obj.employee_id else None

    def get_employee_avatar(self, obj):
        if obj.employee_id and obj.employee.avatar_id:
            return StoredFileSerializer(obj.employee.avatar).data
        return None

    def get_department(self, obj):
        return obj.employee.department if obj.employee_id else None

    def get_position(self, obj):
        return obj.employee.position if obj.employee_id else None

    def get_status(self, obj):
        # assigned — за сотрудником; free — свободен.
        return "assigned" if obj.employee_id else "free"

    def get_maintenance_summary(self, obj):
        return transport_maintenance_summary(obj)

    def validate_inventory_number(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Укажите учётный номер.")
        qs = Transport.objects.filter(inventory_number=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("Транспорт с таким учётным номером уже есть.")
        return value

    def validate(self, attrs):
        transport_type = attrs.get("transport_type") or getattr(self.instance, "transport_type", None)
        field_values_input = attrs.get("field_values_input")
        if field_values_input:
            for item in field_values_input:
                if item["field"].transport_type_id != transport_type.pk:
                    raise serializers.ValidationError(
                        {"field_values": [f"Реквизит «{item['field'].name}» не относится к выбранному Типу."]}
                    )
            # Уникальность «Гос.номера» глобально по всему транспорту (включая
            # списанный). Значение хранится как EAV value_text базового залоченного
            # реквизита — DB-constraint неприменим, проверяем здесь.
            for item in field_values_input:
                field = item["field"]
                if field.is_locked and field.name == BASE_FIELD_PLATE:
                    plate = (item.get("value") or "")
                    plate = str(plate).strip() if plate is not None else ""
                    if plate:
                        dup = TransportFieldValue.objects.filter(
                            field__is_locked=True,
                            field__name=BASE_FIELD_PLATE,
                            value_text__iexact=plate,
                        )
                        if self.instance:
                            dup = dup.exclude(transport=self.instance)
                        if dup.exists():
                            raise serializers.ValidationError(
                                {"field_values": ["Транспорт с таким Гос.номером уже есть."]}
                            )
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        field_values_input = validated_data.pop("field_values_input", [])
        custom_fields_data = validated_data.pop("custom_fields", [])
        instance = Transport.objects.create(**validated_data)
        # Экземпляр наследует планы всех активных регламентов своего типа.
        create_plans_for_transport(instance)
        if field_values_input:
            apply_field_values(instance, "transport", TransportFieldValue, field_values_input, instance.transport_type.fields.all())
        upsert_custom_fields(instance, TransportCustomField, "transport", custom_fields_data)
        self._raise_if_missing_required(instance, skip_file_fields=True)
        return instance

    @transaction.atomic
    def update(self, instance, validated_data):
        field_values_input = validated_data.pop("field_values_input", None)
        custom_fields_data = validated_data.pop("custom_fields", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if field_values_input is not None:
            apply_field_values(instance, "transport", TransportFieldValue, field_values_input, instance.transport_type.fields.all())
        if custom_fields_data is not None:
            upsert_custom_fields(instance, TransportCustomField, "transport", custom_fields_data)
        self._raise_if_missing_required(instance)
        return instance

    def _raise_if_missing_required(self, instance, skip_file_fields=False):
        missing = missing_required_fields(instance, "field_values", instance.transport_type.fields, skip_file_fields=skip_file_fields)
        if missing:
            names = ", ".join(f.name for f in missing)
            raise serializers.ValidationError({"field_values": [f"Не заполнены обязательные реквизиты: {names}."]})


class TransportMiniSerializer(serializers.ModelSerializer):
    """Для вложенных списков (карточка Сотрудника и т.п.)."""

    type_and_model = serializers.SerializerMethodField()
    plate = serializers.SerializerMethodField()

    class Meta:
        model = Transport
        fields = ["id", "inventory_number", "type_and_model", "plate"]

    def get_type_and_model(self, obj):
        model_value = _locked_value(obj, BASE_FIELD_MODEL)
        return f"{obj.transport_type.name} {model_value}" if model_value else obj.transport_type.name

    def get_plate(self, obj):
        return _locked_value(obj, BASE_FIELD_PLATE)


# --- Регламенты ТО ---------------------------------------------------------

class MaintenanceRegulationItemSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(required=False)

    class Meta:
        model = MaintenanceRegulationItem
        fields = ["id", "kind", "name", "quantity"]


class MaintenanceRegulationSerializer(serializers.ModelSerializer):
    items = MaintenanceRegulationItemSerializer(many=True)
    scope = serializers.CharField(read_only=True)

    class Meta:
        model = MaintenanceRegulation
        fields = ["id", "name", "period_months", "on_demand", "is_archived", "scope", "items", "created_at"]
        read_only_fields = ["is_archived", "created_at"]

    def validate_name(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("Укажите наименование регламента.")
        return value

    def validate(self, attrs):
        on_demand = attrs.get("on_demand", getattr(self.instance, "on_demand", False))
        period = attrs.get("period_months", getattr(self.instance, "period_months", None))
        if on_demand:
            attrs["period_months"] = None
        elif not period or period < 1:
            raise serializers.ValidationError(
                {"period_months": ["Укажите периодичность в месяцах или отметьте «по потребности»."]}
            )
        items = attrs.get("items")
        if items is not None:
            cleaned = [i for i in items if (i.get("name") or "").strip()]
            if not cleaned:
                raise serializers.ValidationError({"items": ["Добавьте хотя бы одну работу или материал."]})
            attrs["items"] = cleaned
        return attrs

    def create(self, validated_data):
        items = validated_data.pop("items", [])
        regulation = super().create(validated_data)
        self._sync_items(regulation, items)
        return regulation

    def update(self, instance, validated_data):
        items = validated_data.pop("items", None)
        regulation = super().update(instance, validated_data)
        if items is not None:
            self._sync_items(regulation, items)
        return regulation

    def _sync_items(self, regulation, items):
        regulation.items.all().delete()
        MaintenanceRegulationItem.objects.bulk_create([
            MaintenanceRegulationItem(
                regulation=regulation,
                kind=i["kind"],
                name=i["name"].strip(),
                quantity=i["quantity"],
            )
            for i in items
        ])


# --- Проведение ТО ---------------------------------------------------------

class MaintenancePerformItemSerializer(serializers.Serializer):
    kind = serializers.ChoiceField(choices=MaintenanceKind.choices)
    name = serializers.CharField(max_length=255)
    quantity = serializers.DecimalField(max_digits=12, decimal_places=3, min_value=0)
    from_regulation = serializers.BooleanField(required=False, default=False)
    is_cancelled = serializers.BooleanField(required=False, default=False)
    cancel_reason = serializers.CharField(required=False, allow_blank=True, default="")


class PerformMaintenanceSerializer(serializers.Serializer):
    """B22. Проведение ТО по регламенту (или «Внеплановое» — regulation=null).
    Дополнительно принимает `mileage` — текущий пробег/моточасы (необязательно)."""

    regulation = serializers.PrimaryKeyRelatedField(
        queryset=MaintenanceRegulation.objects.all(), required=False, allow_null=True
    )
    next_planned_date = serializers.DateField(required=False, allow_null=True)
    mileage = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=0, required=False, allow_null=True
    )
    comment = serializers.CharField(required=False, allow_blank=True, default="")
    items = MaintenancePerformItemSerializer(many=True, required=False, default=list)

    def validate_items(self, value):
        for item in value:
            if not item["name"].strip():
                raise serializers.ValidationError("У позиции не заполнено наименование.")
            if item["is_cancelled"] and not (item.get("cancel_reason") or "").strip():
                raise serializers.ValidationError("Для отменённой позиции укажите причину отмены.")
        return value
