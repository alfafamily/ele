"""Базовые сериализаторы регламентного ТО (B13+/B22).

Оборудование и транспорт ведут ТО по одинаковой схеме: шаблон регламента с
позициями (работы/материалы) и запись о проведении. Здесь — модель-независимые
базовые классы; приложения задают лишь `Meta.model` и конкретные вложенные
сериализаторы (см. equipment/transport serializers)."""
from rest_framework import serializers


class BaseMaintenanceRegulationItemSerializer(serializers.ModelSerializer):
    # id — записываемый, но синхронизация всё равно delete+recreate (позиции без
    # истории); id отдаём наружу для устойчивого key на фронте.
    id = serializers.IntegerField(required=False)

    class Meta:
        # model задаёт подкласс: class Meta(Base.Meta): model = MaintenanceRegulationItem
        fields = ["id", "kind", "name", "quantity"]


class BaseMaintenanceRegulationSerializer(serializers.ModelSerializer):
    """Шаблон регламента ТО с позициями. Подкласс задаёт `Meta.model` и поле
    `items` (свой ItemSerializer с many=True)."""

    scope = serializers.CharField(read_only=True)

    class Meta:
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
        # Позиции без собственной истории — пересоздаём целиком. Уже проведённые
        # ТО хранят снимок позиций (MaintenanceRecordItem), правка шаблона на них
        # не влияет. Модель позиции берём из related manager — без привязки к app.
        item_model = regulation.items.model
        regulation.items.all().delete()
        item_model.objects.bulk_create([
            item_model(
                regulation=regulation,
                kind=i["kind"],
                name=i["name"].strip(),
                quantity=i["quantity"],
            )
            for i in items
        ])


class BaseMaintenancePerformItemSerializer(serializers.Serializer):
    # Подкласс переопределяет `kind` со своим MaintenanceKind.choices.
    kind = serializers.ChoiceField(choices=[])
    name = serializers.CharField(max_length=255)
    quantity = serializers.DecimalField(max_digits=12, decimal_places=3, min_value=0)
    from_regulation = serializers.BooleanField(required=False, default=False)
    is_cancelled = serializers.BooleanField(required=False, default=False)
    cancel_reason = serializers.CharField(required=False, allow_blank=True, default="")


class BasePerformMaintenanceSerializer(serializers.Serializer):
    """Проведение ТО по выбранному регламенту (или «Внеплановое» — regulation=null).
    Кросс-валидация (доступность регламента/плана, диапазон даты) — во вью.
    Подкласс задаёт поля `regulation` (свой queryset) и `items` (свой ItemSerializer);
    транспорт добавляет `mileage`."""

    next_planned_date = serializers.DateField(required=False, allow_null=True)
    comment = serializers.CharField(required=False, allow_blank=True, default="")

    def validate_items(self, value):
        for item in value:
            if not item["name"].strip():
                raise serializers.ValidationError("У позиции не заполнено наименование.")
            if item["is_cancelled"] and not (item.get("cancel_reason") or "").strip():
                raise serializers.ValidationError("Для отменённой позиции укажите причину отмены.")
        return value
