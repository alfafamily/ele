from django.db import transaction
from rest_framework import serializers

from core.eav import apply_field_values, missing_required_fields, upsert_custom_fields
from storage.serializers import StoredFileSerializer

from .models import (
    Equipment,
    EquipmentCustomField,
    EquipmentFieldFile,
    EquipmentFieldValue,
    EquipmentType,
    EquipmentTypeField,
    EquipmentTypeFieldOption,
)


class EquipmentTypeFieldOptionSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(required=False)

    class Meta:
        model = EquipmentTypeFieldOption
        fields = ["id", "value", "order"]


class EquipmentTypeFieldSerializer(serializers.ModelSerializer):
    # Элементы списка для value_type=list — writable nested. Для остальных типов
    # не заполняются.
    options = EquipmentTypeFieldOptionSerializer(many=True, required=False)

    class Meta:
        model = EquipmentTypeField
        fields = ["id", "equipment_type", "name", "value_type", "is_required", "allow_multiple", "is_locked", "options"]
        read_only_fields = ["equipment_type", "is_locked"]

    def validate(self, attrs):
        # «Модель» — нельзя переименовать/сделать обязательным.
        if self.instance and self.instance.is_locked:
            if "name" in attrs and attrs["name"] != self.instance.name:
                raise serializers.ValidationError({"name": ["Базовый реквизит «Модель» нельзя переименовать."]})
            if attrs.get("is_required"):
                raise serializers.ValidationError({"is_required": ["Базовый реквизит «Модель» нельзя сделать обязательным."]})
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
        # Значения-строки без собственной истории — проще пересоздать целиком.
        # value уже сохранён копией в value_text у объектов, поэтому удаление
        # опции не рвёт ссылки (см. EquipmentTypeFieldOption).
        field.options.all().delete()
        for i, opt in enumerate(options):
            value = (opt.get("value") or "").strip()
            if not value:
                continue
            EquipmentTypeFieldOption.objects.create(field=field, value=value, order=opt.get("order", i))


class EquipmentTypeSerializer(serializers.ModelSerializer):
    fields = EquipmentTypeFieldSerializer(many=True, read_only=True)
    objects_count = serializers.IntegerField(source="equipment.count", read_only=True)

    class Meta:
        model = EquipmentType
        fields = ["id", "name", "is_archived", "fields", "objects_count"]


class EquipmentFieldValueInputSerializer(serializers.Serializer):
    field = serializers.PrimaryKeyRelatedField(queryset=EquipmentTypeField.objects.all())
    value = serializers.JSONField(required=False, allow_null=True)


class EquipmentFieldFileSerializer(serializers.ModelSerializer):
    file = StoredFileSerializer(source="stored_file", read_only=True)

    class Meta:
        model = EquipmentFieldFile
        fields = ["id", "file"]


class EquipmentFieldValueOutSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source="field.name", read_only=True)
    value_type = serializers.CharField(source="field.value_type", read_only=True)
    allow_multiple = serializers.BooleanField(source="field.allow_multiple", read_only=True)
    value = serializers.SerializerMethodField()
    value_file = StoredFileSerializer(read_only=True)
    # Несколько файлов (allow_multiple) — каждый с id для точечного удаления.
    value_files = EquipmentFieldFileSerializer(source="files", many=True, read_only=True)

    class Meta:
        model = EquipmentFieldValue
        fields = ["field", "name", "value_type", "allow_multiple", "value", "value_file", "value_files"]

    def get_value(self, obj):
        vt = obj.field.value_type
        if vt == "file":
            return None
        if vt == "list":
            # «Список» хранит выбор в value_text (нет value_list).
            return obj.value_text
        return getattr(obj, f"value_{vt}")


class EquipmentCustomFieldSerializer(serializers.ModelSerializer):
    # id — записываемый, чтобы обновлять существующие доп.поля по идентичности
    # (upsert), а не пересоздавать — иначе история изменений шумит.
    id = serializers.IntegerField(required=False)

    class Meta:
        model = EquipmentCustomField
        fields = ["id", "name", "value"]


class EquipmentSerializer(serializers.ModelSerializer):
    """Единый сериализатор чтения/записи. Файловые реквизиты — через
    отдельный upload-эндпоинт (см. views.py), в этом payload не участвуют."""

    # Объявлено явно, чтобы уникальность проверялась своим сообщением
    # (validate_inventory_number), а не авто-валидатором DRF по UniqueConstraint.
    inventory_number = serializers.CharField(max_length=255)
    equipment_type_name = serializers.CharField(source="equipment_type.name", read_only=True)
    type_and_model = serializers.SerializerMethodField()
    employee_name = serializers.SerializerMethodField()
    employee_avatar = serializers.SerializerMethodField()
    department = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()
    place_detail = serializers.SerializerMethodField()
    field_values = EquipmentFieldValueOutSerializer(many=True, read_only=True)
    custom_fields = EquipmentCustomFieldSerializer(many=True, required=False)
    field_values_input = EquipmentFieldValueInputSerializer(many=True, required=False, write_only=True)
    licenses = serializers.SerializerMethodField()
    sim_cards = serializers.SerializerMethodField()

    class Meta:
        model = Equipment
        fields = [
            "id",
            "inventory_number",
            "employee",
            "employee_name",
            "employee_avatar",
            "department",
            "place",
            "place_detail",
            "is_written_off",
            "written_off_at",
            "equipment_type",
            "equipment_type_name",
            "type_and_model",
            "status",
            "field_values",
            "field_values_input",
            "custom_fields",
            "licenses",
            "sim_cards",
            "created_at",
        ]
        read_only_fields = ["is_written_off", "written_off_at", "created_at"]

    def get_type_and_model(self, obj):
        # «{Тип} {Модель}», без Модели — просто «{Тип}».
        model_value = next(
            (fv.value_text for fv in obj.field_values.all() if fv.field.is_locked and fv.field.name == "Модель"),
            None,
        )
        return f"{obj.equipment_type.name} {model_value}" if model_value else obj.equipment_type.name

    def get_employee_name(self, obj):
        return str(obj.employee) if obj.employee_id else None

    def get_employee_avatar(self, obj):
        # Аватар закреплённого Сотрудника — для отображения на карточке
        # Оборудования (блок «Закреплено за»), не только в списке Сотрудников.
        if obj.employee_id and obj.employee.avatar_id:
            return StoredFileSerializer(obj.employee.avatar).data
        return None

    def get_department(self, obj):
        return obj.employee.department if obj.employee_id else None

    def get_status(self, obj):
        # assigned — за сотрудником (мобильно); stationary — на рабочем месте;
        # free — свободно (на складе либо legacy без места).
        if obj.employee_id:
            return "assigned"
        if obj.place_id and obj.place.place_type == "workplace":
            return "stationary"
        return "free"

    def get_place_detail(self, obj):
        if not obj.place_id:
            return None
        p = obj.place
        data = {
            "id": p.id,
            "name": p.name,
            "place_type": p.place_type,
            "room_name": p.room.name,
            "building_name": p.room.building.name,
        }
        # Для рабочего места — сотрудники, закреплённые за ним.
        if p.place_type == "workplace":
            data["employees"] = [
                {"id": e.id, "name": f"{e.last_name} {e.first_name}".strip()} for e in p.employees.all()
            ]
        return data

    def get_licenses(self, obj):
        # Импорт локально — licenses/serializers.py уже импортирует отсюда
        # EquipmentMiniSerializer, модульный импорт наверху дал бы цикл.
        from licenses.serializers import LicenseMiniSerializer

        # «Номер/ключ» программной лицензии — только на карточке (retrieve) и
        # только Admin/Accountant. В списках Оборудования не отдаём (лишние
        # запросы к field_values + не показывается там). На фронте маскируется.
        view = self.context.get("view")
        request = self.context.get("request")
        role = getattr(getattr(request, "user", None), "role", None)
        include_key = getattr(view, "action", None) == "retrieve" and role in ("admin", "accountant")
        return LicenseMiniSerializer(
            obj.licenses.filter(is_retired=False),
            many=True,
            context={"include_key": include_key},
        ).data

    def get_sim_cards(self, obj):
        # SIM, установленные в это оборудование (симка в модеме и т.п.). Только
        # на карточке (retrieve), чтобы не плодить запросы в списке.
        view = self.context.get("view")
        if getattr(view, "action", None) != "retrieve":
            return []
        return [
            {"id": s.id, "phone_number": s.phone_number, "sim_type_display": s.get_sim_type_display()}
            for s in obj.sim_cards.all()
        ]

    def validate_inventory_number(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Укажите учётный номер.")
        # Уникальность по всему Оборудованию (включая списанное).
        qs = Equipment.objects.filter(inventory_number=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("Оборудование с таким учётным номером уже есть.")
        return value

    def validate(self, attrs):
        # Размещение (B8): не более одного из {employee, place}. Обязательность
        # выбора размещения при создании — на стороне формы; бэкенд толерантен
        # (свободное без места допустимо, в т.ч. для legacy-данных).
        employee = attrs.get("employee")
        place = attrs.get("place")
        if employee and place:
            raise serializers.ValidationError(
                {"place": "Оборудование нельзя одновременно закрепить за сотрудником и разместить на месте."}
            )

        equipment_type = attrs.get("equipment_type") or getattr(self.instance, "equipment_type", None)
        field_values_input = attrs.get("field_values_input")
        if field_values_input:
            for item in field_values_input:
                if item["field"].equipment_type_id != equipment_type.pk:
                    raise serializers.ValidationError(
                        {"field_values": [f"Реквизит «{item['field'].name}» не относится к выбранному Типу."]}
                    )
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        field_values_input = validated_data.pop("field_values_input", [])
        custom_fields_data = validated_data.pop("custom_fields", [])
        instance = Equipment.objects.create(**validated_data)
        if field_values_input:
            apply_field_values(instance, "equipment", EquipmentFieldValue, field_values_input, instance.equipment_type.fields.all())
        upsert_custom_fields(instance, EquipmentCustomField, "equipment", custom_fields_data)
        # При создании файловые реквизиты пропускаем: файл прикладывается
        # отдельным эндпоинтом уже после того, как объект существует.
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
            apply_field_values(instance, "equipment", EquipmentFieldValue, field_values_input, instance.equipment_type.fields.all())
        if custom_fields_data is not None:
            upsert_custom_fields(instance, EquipmentCustomField, "equipment", custom_fields_data)
        self._raise_if_missing_required(instance)
        return instance

    def _raise_if_missing_required(self, instance, skip_file_fields=False):
        # Списание — отдельное действие (write_off), сюда не заходит, поэтому
        # исключение "кроме операций списания" выполняется автоматически.
        missing = missing_required_fields(instance, "field_values", instance.equipment_type.fields, skip_file_fields=skip_file_fields)
        if missing:
            names = ", ".join(f.name for f in missing)
            raise serializers.ValidationError({"field_values": [f"Не заполнены обязательные реквизиты: {names}."]})


class EquipmentMiniSerializer(serializers.ModelSerializer):
    """Для вложенных списков (карточка Сотрудника, привязанные лицензии и т.п.)."""

    type_and_model = serializers.SerializerMethodField()

    class Meta:
        model = Equipment
        fields = ["id", "inventory_number", "type_and_model"]

    def get_type_and_model(self, obj):
        model_value = next(
            (fv.value_text for fv in obj.field_values.all() if fv.field.is_locked and fv.field.name == "Модель"),
            None,
        )
        return f"{obj.equipment_type.name} {model_value}" if model_value else obj.equipment_type.name
