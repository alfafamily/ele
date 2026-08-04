from rest_framework import serializers

from core.serializers import EmployeeHolderSerializerMixin, validate_storage_place
from equipment.serializers import EquipmentMiniSerializer
from transport.serializers import TransportMiniSerializer
from locations.models import Building, Place, Room
from locations.serializers import BuildingMiniSerializer, PlaceMiniSerializer, RoomMiniSerializer
from storage.serializers import StoredFileSerializer

from .models import AccessPass, Employee, EmployeeAssignment, EmployeeConsent, SimCard


class ConsentDocumentSerializer(serializers.Serializer):
    """Документ из снимка согласия — вид + ссылка на сохранённую локальную копию."""

    kind = serializers.CharField()
    kind_display = serializers.CharField(source="get_kind_display")
    url = serializers.CharField(source="stored_file.url")
    name = serializers.CharField(source="stored_file.original_filename")


class EmployeeConsentSerializer(serializers.ModelSerializer):
    """B51-R2. Подтверждение согласия для карточки сотрудника."""

    source_display = serializers.CharField(source="get_source_display", read_only=True)
    documents = ConsentDocumentSerializer(many=True, read_only=True)

    class Meta:
        model = EmployeeConsent
        fields = ["source", "source_display", "at", "by_position", "by_name", "device_snapshot", "documents"]


class EmployeeAssignmentSerializer(serializers.ModelSerializer):
    """B32. Эпизод закрепления + статус акцепта — для Профиля, карточки и
    контрольного подраздела «Операции закрепления»."""

    object_kind_display = serializers.CharField(source="get_object_kind_display", read_only=True)
    object_label = serializers.SerializerMethodField()
    object_number = serializers.SerializerMethodField()
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    movement_texts = serializers.SerializerMethodField()
    employee_id = serializers.IntegerField(read_only=True)
    employee_name = serializers.SerializerMethodField()
    decided_by_email = serializers.SerializerMethodField()

    class Meta:
        model = EmployeeAssignment
        fields = [
            "id", "object_kind", "object_kind_display", "object_id", "object_label",
            "object_number",
            "employee_id", "employee_name", "status", "status_display", "was_in_absentia",
            "movement_texts", "assigned_at", "decided_at", "decided_by_email",
            "device_snapshot", "return_quantity",
        ]

    def get_object_label(self, obj):
        from core.assignments import object_label

        try:
            return object_label(obj.content_object) if obj.content_object is not None else None
        except Exception:
            return None

    def get_object_number(self, obj):
        # Учётный номер объекта (для подписи в блоках ожидания). Инструмент —
        # без номера (у него только наименование = object_label).
        o = obj.content_object
        if o is None:
            return None
        from equipment.models import Equipment
        from transport.models import Transport

        if isinstance(o, (Equipment, Transport)):
            return o.inventory_number
        if isinstance(o, SimCard):
            return o.phone_number
        if isinstance(o, AccessPass):
            return o.account_number or None
        return None

    def get_movement_texts(self, obj):
        from core.assignments import movement_texts

        return movement_texts(obj)

    def get_employee_name(self, obj):
        return str(obj.employee) if obj.employee_id else None

    def get_decided_by_email(self, obj):
        return obj.decided_by.email if obj.decided_by_id else None


class SimCardSerializer(EmployeeHolderSerializerMixin, serializers.ModelSerializer):
    sim_type_display = serializers.CharField(source="get_sim_type_display", read_only=True)
    # «Неиспользуемая» (не за сотрудником и не в оборудовании, не утилизирована).
    is_deactivated = serializers.BooleanField(read_only=True)
    employee_name = serializers.SerializerMethodField()
    employee_avatar = serializers.SerializerMethodField()
    acceptance_status = serializers.SerializerMethodField()
    # Должность/Отдел закреплённого сотрудника — для строки списка (под ФИО).
    position = serializers.SerializerMethodField()
    department = serializers.SerializerMethodField()
    # Размещение (B8): SIM за сотрудником ИЛИ за оборудованием; свободная — на складе.
    # equipment_detail — тип+модель и учётный номер оборудования (как у лицензий).
    equipment_detail = EquipmentMiniSerializer(source="equipment", read_only=True)
    storage_place_detail = serializers.SerializerMethodField()
    # Объявлено явно, чтобы уникальность проверялась своим сообщением
    # (validate_phone_number), а не авто-валидатором DRF по UniqueConstraint.
    phone_number = serializers.CharField(max_length=32)

    class Meta:
        model = SimCard
        fields = [
            "id",
            "employee",
            "employee_name",
            "employee_avatar",
            "acceptance_status",
            "position",
            "department",
            "equipment",
            "equipment_detail",
            "storage_place",
            "storage_place_detail",
            "sim_type",
            "sim_type_display",
            "phone_number",
            "network_operator",
            "provider",
            "is_deactivated",
            "is_utilized",
            "utilized_at",
            "created_at",
        ]
        # employee/equipment можно задать при создании (сразу разместить) или
        # через action attach/detach; статусы is_deactivated/is_utilized — read-only,
        # утилизация только через action utilize.
        read_only_fields = ["created_at", "is_utilized", "utilized_at"]

    def validate_phone_number(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Укажите номер телефона.")
        # Уникальность по всем SIM (активным и деактивированным).
        qs = SimCard.objects.filter(phone_number=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("SIM-карта с таким номером уже есть.")
        return value

    def validate(self, attrs):
        # Размещение: не более одного из {employee, equipment}; при создании
        # свободной SIM (без сотрудника и оборудования) обязателен склад.
        employee = attrs.get("employee")
        equipment = attrs.get("equipment")
        if employee and equipment:
            raise serializers.ValidationError(
                {"equipment": "SIM нельзя одновременно закрепить за сотрудником и за оборудованием."}
            )
        # B17: установить SIM можно только в оборудование, у типа которого
        # включён флаг «Установка SIM/E-SIM».
        if equipment and not equipment.equipment_type.allows_sim:
            raise serializers.ValidationError(
                {"equipment": "В этот тип оборудования нельзя устанавливать SIM/E-SIM."}
            )
        storage = attrs.get("storage_place")
        validate_storage_place(storage)
        # Физическая SIM (не E-SIM) при создании обязана иметь размещение —
        # сотрудник, оборудование или склад. E-SIM виртуальна и может быть
        # свободной. Раньше это гарантировала только форма; серверный гард
        # закрывает обход (напр. переключение типа E-SIM→SIM в форме или прямой
        # запрос к API), иначе физическая карта повисает без места хранения.
        if self.instance is None and (attrs.get("sim_type") or SimCard.SimType.SIM) != SimCard.SimType.ESIM:
            if not employee and not equipment and storage is None:
                raise serializers.ValidationError({"storage_place": "Выберите место хранения (склад)."})
        return attrs


class AccessPassSerializer(EmployeeHolderSerializerMixin, serializers.ModelSerializer):
    # Здания/помещения на чтение — вложенно; на запись — по id. Один пропуск
    # может действовать в нескольких зданиях (buildings — M2M).
    buildings = BuildingMiniSerializer(many=True, read_only=True)
    # Здание может попасть в набор двумя способами (B15): как самостоятельный
    # объект доступа «здание целиком» (тогда у него обязан быть флаг «Требуется
    # ключ/пропуск» — проверка в validate()) или как контейнер выбранного
    # помещения/места внутри него (тогда собственный флаг здания не нужен).
    # Поэтому здесь queryset по флагу не режем — ограничение на «здание целиком»
    # накладывается в validate().
    building_ids = serializers.PrimaryKeyRelatedField(
        source="buildings",
        queryset=Building.objects.filter(is_archived=False),
        many=True,
        write_only=True,
        allow_empty=False,
    )
    rooms = RoomMiniSerializer(many=True, read_only=True)
    # Помещение как объект доступа выбирается только с флагом (в набор `rooms`
    # попадают лишь явно выбранные помещения, контейнером помещение не бывает).
    room_ids = serializers.PrimaryKeyRelatedField(
        source="rooms",
        queryset=Room.objects.filter(is_archived=False, requires_pass=True),
        many=True,
        write_only=True,
        required=False,
    )
    # Места-объекты доступа: выбрать можно только места с флагом requires_pass.
    places = PlaceMiniSerializer(many=True, read_only=True)
    place_ids = serializers.PrimaryKeyRelatedField(
        source="places",
        queryset=Place.objects.filter(is_archived=False, requires_pass=True),
        many=True,
        write_only=True,
        required=False,
    )
    is_deactivated = serializers.BooleanField(read_only=True)
    object_type_display = serializers.CharField(source="get_object_type_display", read_only=True)
    pass_kind_display = serializers.CharField(source="get_pass_kind_display", read_only=True)
    # Транспортный пропуск (B34): закреплён за единицей транспорта. На чтение —
    # кратко (для карточек/списков), на запись — по id (поле transport).
    transport_detail = serializers.SerializerMethodField()
    utilization_reason_display = serializers.CharField(source="get_utilization_reason_display", read_only=True)
    employee_name = serializers.SerializerMethodField()
    employee_avatar = serializers.SerializerMethodField()
    acceptance_status = serializers.SerializerMethodField()
    # Должность/Отдел закреплённого сотрудника — для строки списка (под ФИО).
    position = serializers.SerializerMethodField()
    department = serializers.SerializerMethodField()
    # Размещение (B8): свободный пропуск/ключ лежит на складе (место хранения).
    storage_place_detail = serializers.SerializerMethodField()
    # Явно — чтобы уникальность непустого номера проверялась своим сообщением.
    account_number = serializers.CharField(max_length=64, required=False, allow_blank=True)

    class Meta:
        model = AccessPass
        fields = [
            "id",
            "object_type",
            "object_type_display",
            "pass_kind",
            "pass_kind_display",
            "employee",
            "employee_name",
            "employee_avatar",
            "acceptance_status",
            "position",
            "department",
            "transport",
            "transport_detail",
            "account_number",
            "type_vehicle",
            "type_pedestrian",
            "buildings",
            "building_ids",
            "rooms",
            "room_ids",
            "places",
            "place_ids",
            "storage_place",
            "storage_place_detail",
            "is_deactivated",
            "is_utilized",
            "utilized_at",
            "utilization_reason",
            "utilization_reason_display",
            "created_at",
        ]
        # employee можно задать при создании (сразу привязать) или через
        # action attach/detach; статусы утилизации — read-only (только action
        # utilize).
        read_only_fields = ["created_at", "is_utilized", "utilized_at", "utilization_reason"]
        # Уникальность учётного номера проверяем вручную в validate() — в разрезе
        # object_type и только среди непустых (B1). Иначе DRF из составного
        # UniqueConstraint (object_type, account_number) автоматически добавил бы
        # UniqueTogetherValidator, который делает account_number обязательным и
        # отдаёт ошибку в non_field_errors — оба поведения нам не нужны.
        validators = []

    def get_transport_detail(self, obj):
        return TransportMiniSerializer(obj.transport).data if obj.transport_id else None

    def validate_account_number(self, value):
        # Уникальность проверяется в validate() — там уже известен object_type
        # (номера пропусков и ключей независимы, см. B1).
        return value.strip()

    def _resolve_m2m(self, attrs, field):
        """Значение M2M-набора (buildings/rooms/places): из запроса, иначе — из
        уже сохранённого объекта (частичное обновление не сбрасывает набор)."""
        value = attrs.get(field)
        if value is None:
            value = list(getattr(self.instance, field).all()) if self.instance else []
        return value

    def _resolve_scalar(self, attrs, field, default):
        """Скалярное поле: из запроса, иначе — из объекта, иначе — дефолт."""
        value = attrs.get(field)
        if value is None:
            value = getattr(self.instance, field) if self.instance else default
        return value

    def validate(self, attrs):
        # B53-R4: тяжёлый validate() (был CC 41) разложен на проверки по
        # смыслу; порядок вызовов = прежний порядок выдачи ошибок.
        buildings = self._resolve_m2m(attrs, "buildings")
        rooms = self._resolve_m2m(attrs, "rooms")
        places = self._resolve_m2m(attrs, "places")
        object_type = self._resolve_scalar(attrs, "object_type", AccessPass.ObjectType.PASS)

        self._validate_access_scope(buildings, rooms, places)
        self._validate_pass_kind(attrs, object_type, rooms, places)
        self._validate_account_uniqueness(attrs, object_type)
        self._validate_key_scope(object_type, buildings, rooms, places)
        # Размещение (B8): свободный (без сотрудника) пропуск/ключ лежит на складе.
        # Обязательность выбора склада при создании — на стороне формы.
        validate_storage_place(attrs.get("storage_place"))
        return attrs

    def _validate_access_scope(self, buildings, rooms, places):
        # Каждое выбранное помещение/место должно принадлежать одному из
        # выбранных зданий (место — через своё помещение).
        building_ids = {b.id for b in buildings}
        if rooms and any(r.building_id not in building_ids for r in rooms):
            raise serializers.ValidationError(
                {"room_ids": "Помещения должны относиться к выбранным зданиям."}
            )
        if places and any(p.room.building_id not in building_ids for p in places):
            raise serializers.ValidationError(
                {"place_ids": "Места должны относиться к выбранным зданиям."}
            )

        # B15: «здание целиком» как объект доступа допустимо только у зданий с
        # флагом «Требуется ключ/пропуск». Здание, внутри которого выбрано
        # конкретное помещение/место, — лишь контейнер, его флаг не требуется.
        covered_building_ids = {r.building_id for r in rooms} | {p.room.building_id for p in places}
        whole_building_no_flag = [
            b for b in buildings if b.id not in covered_building_ids and not b.requires_pass
        ]
        if whole_building_no_flag:
            raise serializers.ValidationError(
                {"building_ids": "Здание целиком можно выбрать только с признаком «Требуется ключ/пропуск»."}
            )

    def _validate_pass_kind(self, attrs, object_type, rooms, places):
        # B34. Вид пропуска: транспортный пропуск закрепляется за единицей
        # транспорта и действует только на уровне зданий целиком (без помещений/
        # мест и без типа Личный авто/Пеший). Ключ транспортным быть не может.
        pass_kind = self._resolve_scalar(attrs, "pass_kind", AccessPass.PassKind.PERSONAL)
        if pass_kind == AccessPass.PassKind.TRANSPORT:
            if object_type != AccessPass.ObjectType.PASS:
                raise serializers.ValidationError(
                    {"pass_kind": "Транспортным может быть только пропуск СКУД."}
                )
            if rooms or places:
                raise serializers.ValidationError(
                    {"room_ids": "У транспортного пропуска выбираются только здания."}
                )
            # Тип Личный авто/Пеший к транспортному пропуску не применяется.
            attrs["type_vehicle"] = False
            attrs["type_pedestrian"] = False
            # Транспортный пропуск не закрепляется за сотрудником.
            if attrs.get("employee") is not None:
                raise serializers.ValidationError(
                    {"employee": "Транспортный пропуск закрепляется за транспортом, а не за сотрудником."}
                )
        else:
            # Персональный пропуск/ключ не может быть закреплён за транспортом.
            if attrs.get("transport") is not None:
                raise serializers.ValidationError(
                    {"transport": "За транспортом закрепляется только транспортный пропуск."}
                )

    def _validate_account_uniqueness(self, attrs, object_type):
        # Уникальность учётного номера — в разрезе типа объекта и только среди
        # непустых (пропуска и ключи не конфликтуют между собой, см. B1).
        account_number = attrs.get("account_number")
        if account_number is None and self.instance:
            account_number = self.instance.account_number
        if account_number:
            qs = AccessPass.objects.filter(object_type=object_type, account_number=account_number)
            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                label = "Ключ" if object_type == AccessPass.ObjectType.KEY else "Пропуск"
                raise serializers.ValidationError(
                    {"account_number": f"{label} с таким учётным номером уже есть."}
                )

    def _validate_key_scope(self, object_type, buildings, rooms, places):
        # Ключ — строго один объект доступа: одно здание ИЛИ одно помещение ИЛИ
        # одно место. Название у ключа не используется.
        if object_type == AccessPass.ObjectType.KEY:
            if len(buildings) != 1:
                raise serializers.ValidationError(
                    {"building_ids": "У ключа должно быть выбрано ровно одно здание."}
                )
            if len(rooms) + len(places) > 1:
                raise serializers.ValidationError(
                    {"room_ids": "У ключа можно выбрать только один объект: помещение или место."}
                )


# Списанное (архивное) Оборудование не считается закреплённым за Сотрудником —
# в списке/карточке и в счётчике показываем только активное .
def _active_equipment(employee):
    return [eq for eq in employee.equipment.all() if not eq.is_written_off]


# Списанный транспорт не считается закреплённым за Сотрудником — показываем только
# активный (B3).
def _active_transport(employee):
    return [t for t in employee.transport.all() if not t.is_written_off]


# Закреплённые за сотрудником инструменты (количественные): за ним может числиться
# часть единиц; списанные карточки закреплений не имеют.
def _tool_entries(employee):
    from tools.models import ToolAllocation

    allocs = (
        ToolAllocation.objects.filter(employee=employee, tool__is_written_off=False)
        .select_related("tool")
        .order_by("tool__name")
    )
    return [{"id": a.tool_id, "name": a.tool.name, "quantity": a.quantity} for a in allocs]


class EmployeeListSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()
    equipment_count = serializers.SerializerMethodField()
    # B65: статус согласия на обработку ПДн для иконки в списке — self / operator /
    # none (self приоритетнее, как и на карточке в ConsentCard).
    consent_status = serializers.SerializerMethodField()
    # Аватар — только чтение здесь: загрузка/замена через отдельный
    # EmployeeAvatarUploadView (multipart), как и Company.logo .
    avatar = StoredFileSerializer(read_only=True)

    class Meta:
        model = Employee
        fields = [
            "id",
            "first_name",
            "last_name",
            "full_name",
            "position",
            "department",
            "avatar",
            "equipment_count",
            "consent_status",
            "is_employed",
            "is_anonymized",
        ]

    def get_full_name(self, obj):
        return str(obj)

    def get_equipment_count(self, obj):
        return len(_active_equipment(obj))

    def get_consent_status(self, obj):
        # obj.consents прогрет prefetch'ем в EmployeeViewSet.get_queryset (list).
        sources = {c.source for c in obj.consents.all()}
        if EmployeeConsent.Source.SELF in sources:
            return "self"
        if EmployeeConsent.Source.OPERATOR in sources:
            return "operator"
        return "none"


class EmployeeSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()
    equipment = serializers.SerializerMethodField()
    transport = serializers.SerializerMethodField()
    tools = serializers.SerializerMethodField()
    sim_cards = serializers.SerializerMethodField()
    passes = serializers.SerializerMethodField()
    workplaces = serializers.SerializerMethodField()
    parking_spots = serializers.SerializerMethodField()
    user_email = serializers.SerializerMethodField()
    avatar = StoredFileSerializer(read_only=True)
    consents = EmployeeConsentSerializer(many=True, read_only=True)

    class Meta:
        model = Employee
        fields = [
            "id",
            "first_name",
            "last_name",
            "full_name",
            "position",
            "department",
            "avatar",
            "is_employed",
            "is_anonymized",
            "equipment",
            "transport",
            "tools",
            "sim_cards",
            "passes",
            "workplaces",
            "parking_spots",
            "user_email",
            "consents",
        ]
        read_only_fields = ["is_employed"]

    def get_full_name(self, obj):
        return str(obj)

    def get_equipment(self, obj):
        return EquipmentMiniSerializer(_active_equipment(obj), many=True).data

    def get_transport(self, obj):
        # К краткой карточке транспорта добавляем состояние парковки (место / на
        # адресе сотрудника / нет) — показывается в блоке транспорта сотрудника.
        from transport.serializers import transport_parking

        items = _active_transport(obj)
        data = TransportMiniSerializer(items, many=True).data
        for row, t in zip(data, items):
            row["parking"] = transport_parking(t)
        return data

    def get_tools(self, obj):
        # Закреплённые за сотрудником инструменты (строкой «Название · N шт.»).
        return _tool_entries(obj)

    def get_sim_cards(self, obj):
        # Показываем и активные, и деактивированные (для истории). Порядок —
        # из Meta.ordering модели: активные выше архивных.
        return SimCardSerializer(obj.sim_cards.all(), many=True).data

    def get_passes(self, obj):
        # И активные, и деактивированные пропуска (для истории).
        return AccessPassSerializer(obj.passes.all(), many=True).data

    def get_workplaces(self, obj):
        # Рабочие места, за которыми закреплён сотрудник (не архивные), с
        # перечнем объектов, стоящих на каждом месте (оборудование, инструменты).
        # Только place_type=workplace — парковочные места отдаём отдельно.
        result = []
        workplaces = obj.workplaces.filter(
            is_archived=False, place_type=Place.PlaceType.WORKPLACE
        ).select_related("room__building")
        for p in workplaces:
            equipment = [eq for eq in p.equipment.all() if not eq.is_written_off]
            tools = [
                {"id": a.tool_id, "name": a.tool.name, "quantity": a.quantity}
                for a in p.tool_allocations.all()
                if a.place_id == p.id and not a.tool.is_written_off
            ]
            result.append({
                "id": p.id,
                "name": p.name,
                "location": f"{p.room.building.name} — {p.room.name}",
                "equipment": EquipmentMiniSerializer(equipment, many=True).data,
                "tools": tools,
            })
        return result

    def get_parking_spots(self, obj):
        # Парковочные места личного авто сотрудника (не архивные), с планом парковки.
        from storage.serializers import StoredFileSerializer

        result = []
        spots = obj.workplaces.filter(
            is_archived=False, place_type=Place.PlaceType.PARKING_SPOT
        ).select_related("room__building", "room__plan_file")
        for p in spots:
            plan = p.room.plan_file
            result.append({
                "id": p.id,
                "name": p.name,
                "location": f"{p.room.building.name} — {p.room.name}",
                "requires_pass": p.requires_pass,
                "plan_file": StoredFileSerializer(plan).data if plan else None,
            })
        return result

    def get_user_email(self, obj):
        return obj.user.email if hasattr(obj, "user") else None
