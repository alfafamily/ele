from django.db import transaction
from rest_framework import serializers

from core.eav import upsert_custom_fields
from employees.models import Employee
from locations.models import Place
from storage.serializers import StoredFileSerializer

from .models import Tool, ToolAllocation, ToolCustomField, ToolMovement


class ToolCustomFieldSerializer(serializers.ModelSerializer):
    # id — записываемый, чтобы обновлять существующие доп.поля по идентичности
    # (upsert), а не пересоздавать — иначе история изменений шумит.
    id = serializers.IntegerField(required=False)

    class Meta:
        model = ToolCustomField
        fields = ["id", "name", "value"]


class ToolAllocationSerializer(serializers.ModelSerializer):
    """Размещение части инструмента (сотрудник / рабочее место / склад) —
    для карточки инструмента."""

    kind = serializers.CharField(source="target_kind", read_only=True)
    employee_name = serializers.SerializerMethodField()
    employee_avatar = serializers.SerializerMethodField()
    department = serializers.SerializerMethodField()
    place_name = serializers.SerializerMethodField()
    place_location = serializers.SerializerMethodField()
    place_employees = serializers.SerializerMethodField()

    class Meta:
        model = ToolAllocation
        fields = [
            "id", "kind", "employee", "employee_name", "employee_avatar", "department",
            "place", "place_name", "place_location", "place_employees", "quantity",
        ]

    def get_employee_name(self, obj):
        return str(obj.employee) if obj.employee_id else None

    def get_employee_avatar(self, obj):
        if obj.employee_id and obj.employee.avatar_id:
            return StoredFileSerializer(obj.employee.avatar).data
        return None

    def get_department(self, obj):
        return obj.employee.department if obj.employee_id else None

    def get_place_name(self, obj):
        return obj.place.name if obj.place_id else None

    def get_place_location(self, obj):
        if not obj.place_id:
            return None
        return f"{obj.place.room.building.name} — {obj.place.room.name}"

    def get_place_employees(self, obj):
        # Сотрудники рабочего места — только для стационарных размещений.
        if obj.target_kind != "workplace":
            return None
        return [
            {"id": e.id, "name": f"{e.last_name} {e.first_name}".strip()} for e in obj.place.employees.all()
        ]


class ToolSerializer(serializers.ModelSerializer):
    allocated = serializers.SerializerMethodField()
    free = serializers.SerializerMethodField()
    # Свободный остаток без привязки к складу (после обновления/увольнения).
    free_unplaced = serializers.SerializerMethodField()
    allocations = ToolAllocationSerializer(many=True, read_only=True)
    custom_fields = ToolCustomFieldSerializer(many=True, required=False)
    # Начальный склад: при создании ненулевой остаток кладётся на это место
    # хранения (обязательно). Опционально часть остатка сразу выдаётся сотруднику.
    place = serializers.PrimaryKeyRelatedField(write_only=True, required=False, allow_null=True, queryset=Place.objects.all())
    employee = serializers.PrimaryKeyRelatedField(write_only=True, required=False, allow_null=True, queryset=Employee.objects.all())
    employee_quantity = serializers.IntegerField(write_only=True, required=False)

    class Meta:
        model = Tool
        fields = [
            "id",
            "name",
            "quantity",
            "place",
            "employee",
            "employee_quantity",
            "allocated",
            "free",
            "free_unplaced",
            "allocations",
            "custom_fields",
            "is_written_off",
            "written_off_at",
            "created_at",
        ]
        # quantity — записываемый только при создании (начальный остаток);
        # unit-операции меняют его через отдельные экшены (enforced в update).
        read_only_fields = ["is_written_off", "written_off_at", "created_at"]

    def get_allocated(self, obj):
        # Закреплено = за сотрудниками и рабочими местами (не склад).
        return sum(a.quantity for a in obj.allocations.all() if a.target_kind != "storage")

    def get_free(self, obj):
        # Свободно = остаток − закреплено (авторитетно). Складские размещения —
        # разбивка, где лежит свободный остаток (см. kind=storage в allocations);
        # неразмещённый хвост возможен после массовых откреплений (увольнение).
        return obj.quantity - self.get_allocated(obj)

    def get_free_unplaced(self, obj):
        # Свободный остаток без склада = свободно − сумма складских размещений.
        placed = sum(a.quantity for a in obj.allocations.all() if a.target_kind == "storage")
        return self.get_free(obj) - placed

    def validate_name(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("Укажите наименование.")
        return value

    def validate(self, attrs):
        # При создании ненулевой остаток обязательно кладётся на склад; часть
        # можно сразу выдать сотруднику (employee + employee_quantity).
        if self.instance is None:
            quantity = attrs.get("quantity") or 0
            place = attrs.get("place")
            employee = attrs.get("employee")
            emp_qty = attrs.get("employee_quantity") or 0
            if quantity > 0 and place is None:
                raise serializers.ValidationError({"place": "Укажите место хранения для остатка."})
            if place is not None and place.place_type != Place.PlaceType.STORAGE:
                raise serializers.ValidationError({"place": "Выберите место хранения (склад)."})
            if employee and emp_qty <= 0:
                raise serializers.ValidationError({"employee_quantity": "Укажите количество для сотрудника."})
            if emp_qty > 0 and not employee:
                raise serializers.ValidationError({"employee": "Выберите сотрудника."})
            if emp_qty > quantity:
                raise serializers.ValidationError({"employee_quantity": "Нельзя выдать больше начального остатка."})
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        custom_fields_data = validated_data.pop("custom_fields", [])
        place = validated_data.pop("place", None)
        employee = validated_data.pop("employee", None)
        emp_qty = validated_data.pop("employee_quantity", 0) or 0
        instance = Tool.objects.create(**validated_data)
        upsert_custom_fields(instance, ToolCustomField, "tool", custom_fields_data)

        if instance.quantity and place is not None:
            emp_qty = emp_qty if employee else 0
            storage_qty = instance.quantity - emp_qty
            if storage_qty > 0:
                ToolAllocation.objects.create(tool=instance, place=place, quantity=storage_qty)
            if employee and emp_qty > 0:
                ToolAllocation.objects.create(tool=instance, employee=employee, quantity=emp_qty)
            # История движений при создании с разделением: сколько на хранение и
            # сколько выдано сотруднику.
            if employee and emp_qty > 0:
                request = self.context.get("request")
                user = getattr(request, "user", None) if request else None
                created_by = user if getattr(user, "is_authenticated", False) else None
                if storage_qty > 0:
                    ToolMovement.objects.create(
                        tool=instance, kind=ToolMovement.Kind.ADD, quantity=storage_qty,
                        place=place, created_by=created_by,
                    )
                ToolMovement.objects.create(
                    tool=instance, kind=ToolMovement.Kind.ASSIGN, quantity=emp_qty,
                    employee=employee, storage_place=place, created_by=created_by,
                )
        return instance

    @transaction.atomic
    def update(self, instance, validated_data):
        custom_fields_data = validated_data.pop("custom_fields", None)
        # Остаток меняют только unit-операции (add/write-off-units), не форма.
        validated_data.pop("quantity", None)
        validated_data.pop("place", None)
        validated_data.pop("employee", None)
        validated_data.pop("employee_quantity", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if custom_fields_data is not None:
            upsert_custom_fields(instance, ToolCustomField, "tool", custom_fields_data)
        return instance


class ToolMiniSerializer(serializers.ModelSerializer):
    """Для карточки Сотрудника (блок «Инструменты»)."""

    class Meta:
        model = Tool
        fields = ["id", "name"]
