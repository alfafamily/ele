from django.db import transaction
from rest_framework import serializers

from core.eav import apply_field_values, missing_required_fields, upsert_custom_fields
from equipment.serializers import EquipmentMiniSerializer
from storage.serializers import StoredFileSerializer

from .models import (
    License,
    LicenseCustomField,
    LicenseFieldFile,
    LicenseFieldValue,
    LicenseType,
    LicenseTypeField,
    LicenseTypeFieldOption,
)


# Зафиксированные (is_locked) реквизиты-ключи базовых Типов: «Номер/ключ»
# у «Программной» и «Номер/ID/Serial токена» у «Аппаратной». Оба — секретные
# (маскируются, скрыты в списках), обязательные, уникальные. Значение в value_text.
LICENSE_KEY_FIELD_NAME = "Номер/ключ"


def _license_key_value(license_obj):
    # У лицензии не более одного зафиксированного реквизита-ключа (свой у Типа).
    for fv in license_obj.field_values.all():
        if fv.field.is_locked:
            return fv.value_text
    return None


class LicenseTypeFieldOptionSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(required=False)

    class Meta:
        model = LicenseTypeFieldOption
        fields = ["id", "value", "order"]


class LicenseTypeFieldSerializer(serializers.ModelSerializer):
    # Элементы списка для value_type=list — writable nested (см. equipment).
    options = LicenseTypeFieldOptionSerializer(many=True, required=False)

    class Meta:
        model = LicenseTypeField
        fields = ["id", "license_type", "name", "value_type", "is_required", "allow_multiple", "is_locked", "options"]
        read_only_fields = ["license_type", "is_locked"]

    def validate(self, attrs):
        # «Номер/ключ» у «Программной» — нельзя переименовать/сделать необязательным.
        if self.instance and self.instance.is_locked:
            if "name" in attrs and attrs["name"] != self.instance.name:
                raise serializers.ValidationError({"name": ["Зафиксированный реквизит нельзя переименовать."]})
            if attrs.get("is_required") is False:
                raise serializers.ValidationError({"is_required": ["Зафиксированный реквизит нельзя сделать необязательным."]})
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
            LicenseTypeFieldOption.objects.create(field=field, value=value, order=opt.get("order", i))


class LicenseTypeSerializer(serializers.ModelSerializer):
    fields = LicenseTypeFieldSerializer(many=True, read_only=True)
    objects_count = serializers.IntegerField(source="licenses.count", read_only=True)

    class Meta:
        model = LicenseType
        fields = ["id", "name", "kind", "is_archived", "is_locked", "fields", "objects_count"]
        read_only_fields = ["is_locked"]

    def validate(self, attrs):
        if self.instance and self.instance.is_locked and "name" in attrs and attrs["name"] != self.instance.name:
            raise serializers.ValidationError({"name": ["Базовый Тип лицензии нельзя переименовать."]})
        # Вид задаётся при создании и определяет ключевой реквизит — потом не меняется.
        if self.instance and "kind" in attrs and attrs["kind"] != self.instance.kind:
            raise serializers.ValidationError({"kind": ["Вид Типа нельзя изменить после создания."]})
        return attrs


class LicenseFieldValueInputSerializer(serializers.Serializer):
    field = serializers.PrimaryKeyRelatedField(queryset=LicenseTypeField.objects.all())
    value = serializers.JSONField(required=False, allow_null=True)


class LicenseFieldFileSerializer(serializers.ModelSerializer):
    file = StoredFileSerializer(source="stored_file", read_only=True)

    class Meta:
        model = LicenseFieldFile
        fields = ["id", "file"]


class LicenseFieldValueOutSerializer(serializers.ModelSerializer):
    """Значение «Номер/ключ» видно только здесь (карточка), никогда в списках."""

    name = serializers.CharField(source="field.name", read_only=True)
    value_type = serializers.CharField(source="field.value_type", read_only=True)
    allow_multiple = serializers.BooleanField(source="field.allow_multiple", read_only=True)
    # Секретный реквизит-ключ (маскируется на карточке) — по зафиксированности.
    is_locked = serializers.BooleanField(source="field.is_locked", read_only=True)
    value = serializers.SerializerMethodField()
    value_file = StoredFileSerializer(read_only=True)
    value_files = LicenseFieldFileSerializer(source="files", many=True, read_only=True)

    class Meta:
        model = LicenseFieldValue
        fields = ["field", "name", "value_type", "allow_multiple", "is_locked", "value", "value_file", "value_files"]

    def get_value(self, obj):
        vt = obj.field.value_type
        if vt == "file":
            return None
        # Зафиксированный реквизит-ключ («Номер/ключ», токен) отдаём только тем,
        # кому разрешён секрет (Admin/Accountant). Наблюдателю — null: на карточке
        # поле остаётся, но раскрыть его нечем.
        if obj.field.is_locked and not self.context.get("can_reveal_key", True):
            return None
        if vt == "list":
            return obj.value_text
        return getattr(obj, f"value_{vt}")


class LicenseCustomFieldSerializer(serializers.ModelSerializer):
    # id — записываемый: upsert доп.полей по идентичности (см. equipment).
    id = serializers.IntegerField(required=False)

    class Meta:
        model = LicenseCustomField
        fields = ["id", "name", "value"]


class LicenseSerializer(serializers.ModelSerializer):
    """Карточка объекта — используется на retrieve/create/update. Включает
    «Номер/ключ» через field_values (доступно только в карточке, роль
    уже ограничена на уровне permission_classes раздела «Лицензии»)."""

    license_type_name = serializers.CharField(source="license_type.name", read_only=True)
    # B18: вид типа (software/hardware) — определяет поведение (склад, ключевой
    # реквизит) и допустимую «мягкую» смену типа (только на тот же вид).
    license_type_kind = serializers.CharField(source="license_type.kind", read_only=True)
    equipment_detail = EquipmentMiniSerializer(source="equipment", read_only=True)
    status = serializers.SerializerMethodField()
    # Аппаратная лицензия — физический ключ, свободный может лежать на складе.
    is_hardware = serializers.SerializerMethodField()
    storage_place_detail = serializers.SerializerMethodField()
    field_values = LicenseFieldValueOutSerializer(many=True, read_only=True)
    custom_fields = LicenseCustomFieldSerializer(many=True, required=False)
    field_values_input = LicenseFieldValueInputSerializer(many=True, required=False, write_only=True)

    class Meta:
        model = License
        fields = [
            "id",
            "name",
            "equipment",
            "equipment_detail",
            "storage_place",
            "storage_place_detail",
            "is_hardware",
            "is_retired",
            "retired_at",
            "license_type",
            "license_type_name",
            "license_type_kind",
            "status",
            "field_values",
            "field_values_input",
            "custom_fields",
            "created_at",
        ]
        read_only_fields = ["is_retired", "retired_at", "created_at"]

    def get_status(self, obj):
        return "assigned" if obj.equipment_id else "free"

    def get_is_hardware(self, obj):
        return obj.license_type.kind == LicenseType.Kind.HARDWARE

    def get_storage_place_detail(self, obj):
        if not obj.storage_place_id:
            return None
        p = obj.storage_place
        return {
            "id": p.id, "name": p.name, "place_type": p.place_type,
            "room_name": p.room.name, "building_name": p.room.building.name,
        }

    def validate(self, attrs):
        # Размещение (B8): в оборудовании — значит не на складе. Свободная
        # аппаратная лицензия может лежать на складе.
        from locations.models import Place

        if attrs.get("equipment"):
            attrs["storage_place"] = None
        storage = attrs.get("storage_place")
        if storage is not None and storage.place_type != Place.PlaceType.STORAGE:
            raise serializers.ValidationError({"storage_place": "Выберите место хранения (склад)."})

        # B18: «мягкая» смена типа у существующей лицензии — только на тип того же
        # вида (программный↔программный, аппаратный↔аппаратный).
        new_type = attrs.get("license_type")
        if self.instance and new_type and new_type.pk != self.instance.license_type_id:
            if new_type.kind != self.instance.license_type.kind:
                raise serializers.ValidationError(
                    {"license_type": "Сменить тип можно только на тип того же вида (программный/аппаратный)."}
                )

        license_type = attrs.get("license_type") or getattr(self.instance, "license_type", None)
        field_values_input = attrs.get("field_values_input")
        if field_values_input:
            for item in field_values_input:
                if item["field"].license_type_id != license_type.pk:
                    raise serializers.ValidationError(
                        {"field_values": [f"Реквизит «{item['field'].name}» не относится к выбранному Типу."]}
                    )
                # Уникальность зафиксированного реквизита-ключа («Номер/ключ» у
                # Программной, «Номер/ID/Serial токена» у Аппаратной): двух
                # лицензий с одинаковым ключом/серийником быть не может.
                field = item["field"]
                if field.is_locked:
                    value = item.get("value")
                    value = None if value is None else str(value)
                    if value:
                        dup = LicenseFieldValue.objects.filter(field_id=field.pk, value_text=value)
                        if self.instance:
                            dup = dup.exclude(license_id=self.instance.pk)
                        if dup.exists():
                            raise serializers.ValidationError(
                                {"field_values": [f"Лицензия с таким «{field.name}» уже есть."]}
                            )
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        field_values_input = validated_data.pop("field_values_input", [])
        custom_fields_data = validated_data.pop("custom_fields", [])
        instance = License.objects.create(**validated_data)
        if field_values_input:
            apply_field_values(instance, "license", LicenseFieldValue, field_values_input, instance.license_type.fields.all())
        upsert_custom_fields(instance, LicenseCustomField, "license", custom_fields_data)
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
            apply_field_values(instance, "license", LicenseFieldValue, field_values_input, instance.license_type.fields.all())
        if custom_fields_data is not None:
            upsert_custom_fields(instance, LicenseCustomField, "license", custom_fields_data)
        self._raise_if_missing_required(instance)
        return instance

    def _raise_if_missing_required(self, instance, skip_file_fields=False):
        # Утилизация — отдельное действие, сюда не заходит (исключение).
        missing = missing_required_fields(instance, "field_values", instance.license_type.fields, skip_file_fields=skip_file_fields)
        if missing:
            names = ", ".join(f.name for f in missing)
            raise serializers.ValidationError({"field_values": [f"Не заполнены обязательные реквизиты: {names}."]})


class LicenseListSerializer(serializers.ModelSerializer):
    """Список — «Номер/ключ» отдаётся только по явному запросу (context
    include_key, форма подбора лицензии на карточке Оборудования); в обычном
    списке Лицензий физически отсутствует в выдаче, не просто скрыт на фронте."""

    license_type_name = serializers.CharField(source="license_type.name", read_only=True)
    license_type_kind = serializers.CharField(source="license_type.kind", read_only=True)
    equipment_detail = EquipmentMiniSerializer(source="equipment", read_only=True)
    status = serializers.SerializerMethodField()
    key = serializers.SerializerMethodField()

    class Meta:
        model = License
        fields = [
            "id",
            "name",
            "license_type",
            "license_type_name",
            "license_type_kind",
            "equipment",
            "equipment_detail",
            "status",
            "retired_at",
            "created_at",
            "key",
        ]

    def get_status(self, obj):
        return "assigned" if obj.equipment_id else "free"

    def get_key(self, obj):
        if not self.context.get("include_key"):
            return None
        return _license_key_value(obj)


class LicenseMiniSerializer(serializers.ModelSerializer):
    """Для вложенных списков (блок «Установленные лицензии» карточки Оборудования).
    «Номер/ключ» отдаётся только по context include_key (Admin/Accountant), на
    фронте всё равно маскируется за «глазиком»."""

    license_type_name = serializers.CharField(source="license_type.name", read_only=True)
    key = serializers.SerializerMethodField()

    class Meta:
        model = License
        fields = ["id", "name", "license_type_name", "key"]

    def get_key(self, obj):
        if not self.context.get("include_key"):
            return None
        return _license_key_value(obj)
