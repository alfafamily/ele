from django.db import models
from simple_history.models import HistoricalRecords


class EquipmentType(models.Model):
    """Тип оборудования — классификатор, задающий набор реквизитов."""

    name = models.CharField("Наименование", max_length=255)
    is_archived = models.BooleanField("Архивный", default=False)
    # B17: SIM/E-SIM можно установить только в оборудование, у типа которого
    # этот флаг включён. По умолчанию выключен (opt-in) — существующим типам с
    # уже установленными SIM миграция проставляет True, чтобы не сломать их.
    allows_sim = models.BooleanField("Установка SIM/E-SIM", default=False)
    # Лицензии можно привязывать только к оборудованию, у типа которого этот флаг
    # включён. По умолчанию выключен (opt-in) — существующим типам с уже
    # привязанными лицензиями миграция проставляет True, чтобы не сломать их.
    allows_license = models.BooleanField("Установка лицензий", default=False)
    # B13: у оборудования этого типа можно проводить техобслуживание (ТО) —
    # появляется кнопка «Провести ТО», статус ТО и индикаторы в списке.
    maintenance_enabled = models.BooleanField("Проведение ТО", default=False)

    class Meta:
        verbose_name = "Тип оборудования"
        verbose_name_plural = "Типы оборудования"
        ordering = ["name"]

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        is_new = self._state.adding
        super().save(*args, **kwargs)
        if is_new:
            # Базовый реквизит «Модель» — у каждого Типа оборудования
            # автоматически, нельзя удалить/переименовать/сделать обязательным
            #. Все Типы оборудования пользовательские (в отличие от
            # лицензий), поэтому сеется здесь, не data-миграцией.
            EquipmentTypeField.objects.get_or_create(
                equipment_type=self,
                is_locked=True,
                defaults={
                    "name": "Модель",
                    "value_type": EquipmentTypeField.ValueType.TEXT,
                    "is_required": False,
                },
            )


class EquipmentTypeField(models.Model):
    """Реквизит типа оборудования — EAV-схема значений, см. EquipmentFieldValue."""

    class ValueType(models.TextChoices):
        BOOL = "bool", "Булево"
        TEXT = "text", "Текст"
        INT = "int", "Целое число"
        FLOAT = "float", "Дробное число"
        FILE = "file", "Файл"
        LIST = "list", "Список"

    equipment_type = models.ForeignKey(EquipmentType, on_delete=models.CASCADE, related_name="fields")
    name = models.CharField("Наименование реквизита", max_length=255)
    value_type = models.CharField("Значение типа", max_length=10, choices=ValueType.choices)
    is_required = models.BooleanField("Обязательность", default=False)
    # Только для value_type=file — разрешить прикреплять несколько файлов
    # (хранятся в EquipmentFieldFile, см.).
    allow_multiple = models.BooleanField("Несколько файлов", default=False)
    # «Модель» — нельзя удалить/переименовать/сделать обязательным.
    is_locked = models.BooleanField(default=False)

    class Meta:
        verbose_name = "Реквизит типа оборудования"
        verbose_name_plural = "Реквизиты типа оборудования"

    def __str__(self):
        return f"{self.equipment_type.name} / {self.name}"


class EquipmentTypeFieldOption(models.Model):
    """Элемент списка для реквизита value_type=list — выбирается в форме
    Оборудования через селект; выбранное значение хранится в value_text."""

    field = models.ForeignKey(EquipmentTypeField, on_delete=models.CASCADE, related_name="options")
    value = models.CharField("Значение", max_length=255)
    order = models.IntegerField("Порядок", default=0)

    class Meta:
        verbose_name = "Элемент списка реквизита оборудования"
        verbose_name_plural = "Элементы списка реквизита оборудования"
        ordering = ["order", "id"]

    def __str__(self):
        return f"{self.field.name} / {self.value}"


class Equipment(models.Model):
    """Единица физического актива компании."""

    inventory_number = models.CharField("Учётный номер", max_length=255)
    employee = models.ForeignKey(
        "employees.Employee", verbose_name="Сотрудник",
        on_delete=models.SET_NULL, null=True, blank=True, related_name="equipment",
    )
    # Размещение (B8): не более одного из {employee, place}. employee задан —
    # мобильно (за сотрудником); place с типом workplace — стационарно (на
    # рабочем месте); place с типом storage — свободно (лежит на складе).
    # Свободное оборудование должно указывать склад; legacy-записи допускают NULL.
    place = models.ForeignKey(
        "locations.Place", verbose_name="Размещение",
        on_delete=models.SET_NULL, null=True, blank=True, related_name="equipment",
    )
    is_written_off = models.BooleanField("Признак списания", default=False)
    # Проставляется в момент списания (write_off action) — нужна для колонки
    # «Дата списания» вкладки Архив, отдельно от is_written_off.
    written_off_at = models.DateTimeField("Дата списания", null=True, blank=True)
    # B13+: плановые даты ТО теперь по-регламентно (EquipmentMaintenancePlan),
    # прежняя денормализация next_maintenance_date упразднена.
    # PROTECT: удаление Типа с привязанными объектами запрещено на уровне БД
    # — прикладной код (Фаза 4) превращает ProtectedError в 409.
    equipment_type = models.ForeignKey(
        EquipmentType, verbose_name="Тип оборудования", on_delete=models.PROTECT, related_name="equipment",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    history = HistoricalRecords()

    class Meta:
        verbose_name = "Оборудование"
        verbose_name_plural = "Оборудование"
        ordering = ["-created_at"]
        constraints = [
            # Учётный номер уникален по всему Оборудованию (включая списанное).
            models.UniqueConstraint(fields=["inventory_number"], name="uniq_equipment_inventory"),
        ]

    def __str__(self):
        return self.inventory_number


class EquipmentFieldValue(models.Model):
    """Значение реквизита Типа для конкретной единицы Оборудования (EAV)."""

    equipment = models.ForeignKey(Equipment, on_delete=models.CASCADE, related_name="field_values")
    field = models.ForeignKey(EquipmentTypeField, on_delete=models.CASCADE, related_name="values")
    value_text = models.TextField(null=True, blank=True)
    value_bool = models.BooleanField(null=True, blank=True)
    value_int = models.IntegerField(null=True, blank=True)
    value_float = models.FloatField(null=True, blank=True)
    # Не более 20 МБ — валидация в сериализаторе. FK на StoredFile (Фаза 5).
    value_file = models.ForeignKey(
        "storage.StoredFile", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    # История изменений реквизитов Типа для «Истории изменений» карточки.
    history = HistoricalRecords()

    class Meta:
        verbose_name = "Значение реквизита оборудования"
        verbose_name_plural = "Значения реквизитов оборудования"
        constraints = [
            models.UniqueConstraint(fields=["equipment", "field"], name="uniq_equipment_field_value"),
        ]

    def __str__(self):
        return f"{self.equipment} / {self.field.name}"


class EquipmentFieldFile(models.Model):
    """Один из нескольких файлов реквизита value_type=file с allow_multiple.
    Одиночные файловые реквизиты продолжают жить в EquipmentFieldValue.value_file
    — эта таблица используется только для множественных."""

    field_value = models.ForeignKey(EquipmentFieldValue, on_delete=models.CASCADE, related_name="files")
    stored_file = models.ForeignKey("storage.StoredFile", on_delete=models.SET_NULL, null=True, related_name="+")
    uploaded_at = models.DateTimeField(auto_now_add=True)
    # Чтобы добавление/удаление файла попадало в «Историю изменений» карточки.
    history = HistoricalRecords()

    class Meta:
        verbose_name = "Файл реквизита оборудования"
        verbose_name_plural = "Файлы реквизита оборудования"
        ordering = ["uploaded_at", "id"]

    def __str__(self):
        return f"{self.field_value} / {self.stored_file_id}"


class EquipmentCustomField(models.Model):
    """Произвольное текстовое поле, созданное пользователем для конкретного объекта."""

    equipment = models.ForeignKey(Equipment, on_delete=models.CASCADE, related_name="custom_fields")
    name = models.CharField("Наименование", max_length=255)
    value = models.TextField("Значение", blank=True)
    history = HistoricalRecords()

    class Meta:
        verbose_name = "Дополнительное поле оборудования"
        verbose_name_plural = "Дополнительные поля оборудования"

    def __str__(self):
        return f"{self.equipment} / {self.name}"


class MaintenanceKind(models.TextChoices):
    """Вид позиции ТО — общий для шаблона регламента и записи о проведении."""

    WORK = "work", "Работы"
    MATERIAL = "material", "Материалы"


class MaintenanceRegulation(models.Model):
    """B13+. Регламент ТО — именованный набор работ/материалов с периодичностью.

    Ровно один владелец: `equipment_type` (регламент типа, наследуется всем
    оборудованием типа) ИЛИ `equipment` (индивидуальный регламент конкретного
    экземпляра). Периодичность — либо `period_months` (раз в N месяцев), либо
    `on_demand` (по потребности — плановая дата не назначается, контроля нет)."""

    equipment_type = models.ForeignKey(
        EquipmentType, on_delete=models.CASCADE, null=True, blank=True, related_name="regulations"
    )
    equipment = models.ForeignKey(
        Equipment, on_delete=models.CASCADE, null=True, blank=True, related_name="regulations"
    )
    name = models.CharField("Наименование", max_length=255)
    period_months = models.PositiveSmallIntegerField("Периодичность, мес.", null=True, blank=True)
    on_demand = models.BooleanField("По потребности", default=False)
    is_archived = models.BooleanField("Отменён (архив)", default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Регламент ТО"
        verbose_name_plural = "Регламенты ТО"
        ordering = ["id"]
        constraints = [
            # Ровно один владелец: тип XOR экземпляр.
            models.CheckConstraint(
                name="regulation_one_owner",
                condition=(
                    models.Q(equipment_type__isnull=False, equipment__isnull=True)
                    | models.Q(equipment_type__isnull=True, equipment__isnull=False)
                ),
            ),
        ]

    @property
    def scope(self):
        return "type" if self.equipment_type_id else "individual"

    def __str__(self):
        return f"Регламент «{self.name}»"


class MaintenanceRegulationItem(models.Model):
    """Шаблонная позиция регламента: работа или материал с плановым количеством.
    При проведении ТО копируется в MaintenanceRecordItem (снимок) — правка
    шаблона на уже проведённые ТО не влияет."""

    regulation = models.ForeignKey(MaintenanceRegulation, on_delete=models.CASCADE, related_name="items")
    kind = models.CharField("Тип", max_length=10, choices=MaintenanceKind.choices)
    name = models.CharField("Наименование", max_length=255)
    quantity = models.DecimalField("Количество", max_digits=12, decimal_places=3)

    class Meta:
        verbose_name = "Позиция регламента ТО"
        verbose_name_plural = "Позиции регламента ТО"
        ordering = ["id"]

    def __str__(self):
        return f"{self.get_kind_display()} «{self.name}» × {self.quantity}"


class EquipmentMaintenancePlan(models.Model):
    """B13+. Состояние регламента для конкретного экземпляра оборудования —
    единая точка контроля (статус/индикация/фильтры считаются по планам).

    Заводится на каждую пару (оборудование, регламент): для регламента типа —
    по одному плану на каждый экземпляр типа; для индивидуального — один план на
    его оборудование. `next_planned_date` — плановая дата ближайшего ТО по этому
    регламенту (None — не назначена). `is_cancelled` — регламент отменён для
    этого экземпляра (не контролируется, ТО по нему не проводится)."""

    equipment = models.ForeignKey(Equipment, on_delete=models.CASCADE, related_name="maintenance_plans")
    regulation = models.ForeignKey(MaintenanceRegulation, on_delete=models.CASCADE, related_name="plans")
    next_planned_date = models.DateField("Плановая дата ТО", null=True, blank=True)
    is_cancelled = models.BooleanField("Отменён для экземпляра", default=False)

    class Meta:
        verbose_name = "План ТО оборудования"
        verbose_name_plural = "Планы ТО оборудования"
        ordering = ["id"]
        constraints = [
            models.UniqueConstraint(fields=["equipment", "regulation"], name="uniq_equipment_regulation_plan"),
        ]

    def __str__(self):
        return f"План {self.equipment} / {self.regulation}"


class MaintenanceRecord(models.Model):
    """B13. Запись о проведённом ТО единицы оборудования — создаётся, не
    редактируется (журнал, как ToolMovement). «История изменений» карточки
    восстанавливает строки ТО из этих записей (собственной simple-history нет).

    performed_at — «факт»: момент создания записи в системе. `regulation` — по
    какому регламенту проведено ТО (None — «Внеплановое ТО»). `regulation_name` —
    снимок имени регламента на момент ТО (переживает переименование/удаление).
    prior_planned_date — снимок плановой даты плана до этой записи (нужен для
    отметки «вовремя / с просрочкой N дней»). next_planned_date — новая плановая
    дата (переносится в EquipmentMaintenancePlan.next_planned_date)."""

    # Общий алиас, чтобы не переписывать существующие ссылки Kind в коде/тестах.
    Kind = MaintenanceKind

    equipment = models.ForeignKey(Equipment, on_delete=models.CASCADE, related_name="maintenance_records")
    regulation = models.ForeignKey(
        MaintenanceRegulation, on_delete=models.SET_NULL, null=True, blank=True, related_name="records"
    )
    regulation_name = models.CharField("Регламент (снимок)", max_length=255, blank=True)
    performed_at = models.DateTimeField("Проведено", auto_now_add=True)
    next_planned_date = models.DateField("Дата следующего ТО", null=True, blank=True)
    prior_planned_date = models.DateField("Плановая дата на момент ТО", null=True, blank=True)
    comment = models.TextField("Комментарий", blank=True)
    created_by = models.ForeignKey(
        "accounts.User", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )

    class Meta:
        verbose_name = "Запись о ТО"
        verbose_name_plural = "Записи о ТО"
        ordering = ["performed_at", "id"]

    def __str__(self):
        return f"ТО {self.equipment} / {self.performed_at:%d.%m.%Y}"


class MaintenanceRecordItem(models.Model):
    """Позиция записи о ТО: выполненная работа или израсходованный материал.
    Строки, взятые из регламента, можно отменить (is_cancelled) с обязательной
    причиной (cancel_reason) — они остаются в записи как отменённые."""

    Kind = MaintenanceKind

    record = models.ForeignKey(MaintenanceRecord, on_delete=models.CASCADE, related_name="items")
    kind = models.CharField("Тип", max_length=10, choices=MaintenanceKind.choices)
    name = models.CharField("Наименование", max_length=255)
    quantity = models.DecimalField("Количество", max_digits=12, decimal_places=3)
    # Строка пришла из шаблона регламента (в отличие от добавленной вручную).
    from_regulation = models.BooleanField("Из регламента", default=False)
    is_cancelled = models.BooleanField("Отменена", default=False)
    cancel_reason = models.TextField("Причина отмены", blank=True)

    class Meta:
        verbose_name = "Позиция ТО"
        verbose_name_plural = "Позиции ТО"
        ordering = ["id"]

    def __str__(self):
        return f"{self.get_kind_display()} «{self.name}» × {self.quantity}"
