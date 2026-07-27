from django.db import models
from simple_history.models import HistoricalRecords

# Наименования базовых залоченных реквизитов типа транспорта.
BASE_FIELD_MODEL = "Модель"
BASE_FIELD_PLATE = "Гос.номер"


class TransportType(models.Model):
    """Тип транспорта — классификатор, задающий набор реквизитов (B3).

    В отличие от Оборудования, ТО для транспорта включено всегда (флага нет).
    У каждого типа два свойства, задаваемые при создании и неизменяемые:
      - `mileage_unit` — единица учёта пробега (км / моточасы), в которой при
        проведении ТО фиксируется текущий пробег (на регламенты не влияет);
      - `gibdd_registration` — «Регистрация в ГИБДД». Да → у типа есть базовый
        залоченный реквизит «Гос.номер» и ведётся учёт по госномерам (уникальность);
        Нет → «Гос.номера» у типа нет, только «Модель».
    """

    class MileageUnit(models.TextChoices):
        KM = "km", "По километрам"
        MOTOHOURS = "motohours", "По моточасам"

    name = models.CharField("Наименование", max_length=255)
    is_archived = models.BooleanField("Архивный", default=False)
    mileage_unit = models.CharField(
        "Учёт пробега", max_length=10, choices=MileageUnit.choices, default=MileageUnit.KM
    )
    gibdd_registration = models.BooleanField("Регистрация в ГИБДД", default=True)

    class Meta:
        verbose_name = "Тип транспорта"
        verbose_name_plural = "Типы транспорта"
        ordering = ["name"]

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        is_new = self._state.adding
        super().save(*args, **kwargs)
        if is_new:
            # Базовый реквизит «Модель» — всегда; нельзя удалить/переименовать/
            # сделать обязательным. Все типы транспорта пользовательские, поэтому
            # сеется здесь, не data-миграцией.
            TransportTypeField.objects.get_or_create(
                transport_type=self,
                is_locked=True,
                name=BASE_FIELD_MODEL,
                defaults={
                    "value_type": TransportTypeField.ValueType.TEXT,
                    "is_required": False,
                    "order": 0,
                },
            )
            # «Гос.номер» — только для типов с регистрацией в ГИБДД.
            if self.gibdd_registration:
                TransportTypeField.objects.get_or_create(
                    transport_type=self,
                    is_locked=True,
                    name=BASE_FIELD_PLATE,
                    defaults={
                        "value_type": TransportTypeField.ValueType.TEXT,
                        "is_required": False,
                        "order": 1,
                    },
                )


class TransportTypeField(models.Model):
    """Реквизит типа транспорта — EAV-схема значений, см. TransportFieldValue."""

    class ValueType(models.TextChoices):
        BOOL = "bool", "Булево"
        TEXT = "text", "Текст"
        INT = "int", "Целое число"
        FLOAT = "float", "Дробное число"
        FILE = "file", "Файл"
        LIST = "list", "Список"

    transport_type = models.ForeignKey(TransportType, on_delete=models.CASCADE, related_name="fields")
    name = models.CharField("Наименование реквизита", max_length=255)
    value_type = models.CharField("Значение типа", max_length=10, choices=ValueType.choices)
    is_required = models.BooleanField("Обязательность", default=False)
    # Только для value_type=file — разрешить прикреплять несколько файлов.
    allow_multiple = models.BooleanField("Несколько файлов", default=False)
    # «Модель»/«Гос.номер» — нельзя удалить/переименовать/сделать обязательным.
    is_locked = models.BooleanField(default=False)
    # Пользовательский порядок реквизитов; залоченные зафиксированы сверху.
    order = models.IntegerField("Порядок", default=0)

    class Meta:
        verbose_name = "Реквизит типа транспорта"
        verbose_name_plural = "Реквизиты типа транспорта"
        ordering = ["order", "id"]

    def __str__(self):
        return f"{self.transport_type.name} / {self.name}"


class TransportTypeFieldOption(models.Model):
    """Элемент списка для реквизита value_type=list (значение хранится в value_text)."""

    field = models.ForeignKey(TransportTypeField, on_delete=models.CASCADE, related_name="options")
    value = models.CharField("Значение", max_length=255)
    order = models.IntegerField("Порядок", default=0)

    class Meta:
        verbose_name = "Элемент списка реквизита транспорта"
        verbose_name_plural = "Элементы списка реквизита транспорта"
        ordering = ["order", "id"]

    def __str__(self):
        return f"{self.field.name} / {self.value}"


class Transport(models.Model):
    """Единица транспорта компании (B3).

    Размещение проще Оборудования: транспорт либо закреплён за сотрудником
    (employee задан), либо свободен (employee пуст). Мест/складов нет.
    """

    inventory_number = models.CharField("Учётный номер", max_length=255)
    employee = models.ForeignKey(
        "employees.Employee", verbose_name="Сотрудник",
        on_delete=models.SET_NULL, null=True, blank=True, related_name="transport",
    )
    # Парковка «на адресе сотрудника» — авто не паркуется на территории компании
    # (взаимоисключающе с закреплением за парковочным местом, см. Place.transport).
    # Относится к закреплённому сотруднику: при откреплении без нового — снимается.
    parks_at_driver_address = models.BooleanField("Парковка на адресе сотрудника", default=False)
    is_written_off = models.BooleanField("Признак списания", default=False)
    written_off_at = models.DateTimeField("Дата списания", null=True, blank=True)
    # PROTECT: удаление Типа с привязанными объектами запрещено на уровне БД.
    transport_type = models.ForeignKey(
        TransportType, verbose_name="Тип транспорта", on_delete=models.PROTECT, related_name="transport",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    history = HistoricalRecords()

    class Meta:
        verbose_name = "Транспорт"
        verbose_name_plural = "Транспорт"
        ordering = ["-created_at"]
        constraints = [
            # Учётный номер уникален по всему транспорту (включая списанный).
            models.UniqueConstraint(fields=["inventory_number"], name="uniq_transport_inventory"),
        ]

    def __str__(self):
        return self.inventory_number


class TransportFieldValue(models.Model):
    """Значение реквизита Типа для конкретной единицы транспорта (EAV)."""

    transport = models.ForeignKey(Transport, on_delete=models.CASCADE, related_name="field_values")
    field = models.ForeignKey(TransportTypeField, on_delete=models.CASCADE, related_name="values")
    value_text = models.TextField(null=True, blank=True)
    value_bool = models.BooleanField(null=True, blank=True)
    value_int = models.IntegerField(null=True, blank=True)
    value_float = models.FloatField(null=True, blank=True)
    value_file = models.ForeignKey(
        "storage.StoredFile", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    history = HistoricalRecords()

    class Meta:
        verbose_name = "Значение реквизита транспорта"
        verbose_name_plural = "Значения реквизитов транспорта"
        constraints = [
            models.UniqueConstraint(fields=["transport", "field"], name="uniq_transport_field_value"),
        ]

    def __str__(self):
        return f"{self.transport} / {self.field.name}"


class TransportFieldFile(models.Model):
    """Один из нескольких файлов реквизита value_type=file с allow_multiple.
    Одиночные файловые реквизиты живут в TransportFieldValue.value_file."""

    field_value = models.ForeignKey(TransportFieldValue, on_delete=models.CASCADE, related_name="files")
    stored_file = models.ForeignKey("storage.StoredFile", on_delete=models.SET_NULL, null=True, related_name="+")
    uploaded_at = models.DateTimeField(auto_now_add=True)
    history = HistoricalRecords()

    class Meta:
        verbose_name = "Файл реквизита транспорта"
        verbose_name_plural = "Файлы реквизита транспорта"
        ordering = ["uploaded_at", "id"]

    def __str__(self):
        return f"{self.field_value} / {self.stored_file_id}"


class TransportCustomField(models.Model):
    """Произвольное текстовое поле, созданное пользователем для конкретного объекта."""

    transport = models.ForeignKey(Transport, on_delete=models.CASCADE, related_name="custom_fields")
    name = models.CharField("Наименование", max_length=255)
    value = models.TextField("Значение", blank=True)
    order = models.IntegerField("Порядок", default=0)
    history = HistoricalRecords()

    class Meta:
        verbose_name = "Дополнительное поле транспорта"
        verbose_name_plural = "Дополнительные поля транспорта"
        ordering = ["order", "id"]

    def __str__(self):
        return f"{self.transport} / {self.name}"


class MaintenanceKind(models.TextChoices):
    """Вид позиции ТО — общий для шаблона регламента и записи о проведении."""

    WORK = "work", "Работы"
    MATERIAL = "material", "Материалы"


class MaintenanceRegulation(models.Model):
    """B22. Регламент ТО транспорта — именованный набор работ/материалов с
    периодичностью. Ровно один владелец: `transport_type` (регламент типа,
    наследуется всем транспортом типа) ИЛИ `transport` (индивидуальный регламент
    экземпляра). Периодичность — либо `period_months`, либо `on_demand`."""

    transport_type = models.ForeignKey(
        TransportType, on_delete=models.CASCADE, null=True, blank=True, related_name="regulations"
    )
    transport = models.ForeignKey(
        Transport, on_delete=models.CASCADE, null=True, blank=True, related_name="regulations"
    )
    name = models.CharField("Наименование", max_length=255)
    period_months = models.PositiveSmallIntegerField("Периодичность, мес.", null=True, blank=True)
    on_demand = models.BooleanField("По потребности", default=False)
    is_archived = models.BooleanField("Отменён (архив)", default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Регламент ТО транспорта"
        verbose_name_plural = "Регламенты ТО транспорта"
        ordering = ["id"]
        constraints = [
            models.CheckConstraint(
                name="transport_regulation_one_owner",
                condition=(
                    models.Q(transport_type__isnull=False, transport__isnull=True)
                    | models.Q(transport_type__isnull=True, transport__isnull=False)
                ),
            ),
        ]

    @property
    def scope(self):
        return "type" if self.transport_type_id else "individual"

    def __str__(self):
        return f"Регламент «{self.name}»"


class MaintenanceRegulationItem(models.Model):
    """Шаблонная позиция регламента: работа или материал с плановым количеством.
    При проведении ТО копируется в MaintenanceRecordItem (снимок)."""

    regulation = models.ForeignKey(MaintenanceRegulation, on_delete=models.CASCADE, related_name="items")
    kind = models.CharField("Тип", max_length=10, choices=MaintenanceKind.choices)
    name = models.CharField("Наименование", max_length=255)
    quantity = models.DecimalField("Количество", max_digits=12, decimal_places=3)

    class Meta:
        verbose_name = "Позиция регламента ТО транспорта"
        verbose_name_plural = "Позиции регламента ТО транспорта"
        ordering = ["id"]

    def __str__(self):
        return f"{self.get_kind_display()} «{self.name}» × {self.quantity}"


class TransportMaintenancePlan(models.Model):
    """B22. Состояние регламента для конкретного экземпляра транспорта — единая
    точка контроля (статус/индикация/фильтры считаются по планам)."""

    transport = models.ForeignKey(Transport, on_delete=models.CASCADE, related_name="maintenance_plans")
    regulation = models.ForeignKey(MaintenanceRegulation, on_delete=models.CASCADE, related_name="plans")
    next_planned_date = models.DateField("Плановая дата ТО", null=True, blank=True)
    is_cancelled = models.BooleanField("Отменён для экземпляра", default=False)

    class Meta:
        verbose_name = "План ТО транспорта"
        verbose_name_plural = "Планы ТО транспорта"
        ordering = ["id"]
        constraints = [
            models.UniqueConstraint(fields=["transport", "regulation"], name="uniq_transport_regulation_plan"),
        ]

    def __str__(self):
        return f"План {self.transport} / {self.regulation}"


class MaintenanceRecord(models.Model):
    """B22. Запись о проведённом ТО единицы транспорта — создаётся, не
    редактируется (журнал). Дополнительно фиксирует `mileage` — текущий пробег/
    моточасы на момент ТО (необязательно; на расчёт регламентов не влияет,
    показывается в истории и как «последний пробег» на карточке)."""

    Kind = MaintenanceKind

    transport = models.ForeignKey(Transport, on_delete=models.CASCADE, related_name="maintenance_records")
    regulation = models.ForeignKey(
        MaintenanceRegulation, on_delete=models.SET_NULL, null=True, blank=True, related_name="records"
    )
    regulation_name = models.CharField("Регламент (снимок)", max_length=255, blank=True)
    performed_at = models.DateTimeField("Проведено", auto_now_add=True)
    next_planned_date = models.DateField("Дата следующего ТО", null=True, blank=True)
    prior_planned_date = models.DateField("Плановая дата на момент ТО", null=True, blank=True)
    # Текущий пробег/моточасы на момент ТО (единица — из type.mileage_unit).
    mileage = models.DecimalField("Пробег/моточасы", max_digits=12, decimal_places=2, null=True, blank=True)
    comment = models.TextField("Комментарий", blank=True)
    created_by = models.ForeignKey(
        "accounts.User", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )

    class Meta:
        verbose_name = "Запись о ТО транспорта"
        verbose_name_plural = "Записи о ТО транспорта"
        ordering = ["performed_at", "id"]

    def __str__(self):
        return f"ТО {self.transport} / {self.performed_at:%d.%m.%Y}"


class MaintenanceRecordItem(models.Model):
    """Позиция записи о ТО: выполненная работа или израсходованный материал.
    Строки из регламента можно отменить (is_cancelled) с обязательной причиной."""

    Kind = MaintenanceKind

    record = models.ForeignKey(MaintenanceRecord, on_delete=models.CASCADE, related_name="items")
    kind = models.CharField("Тип", max_length=10, choices=MaintenanceKind.choices)
    name = models.CharField("Наименование", max_length=255)
    quantity = models.DecimalField("Количество", max_digits=12, decimal_places=3)
    from_regulation = models.BooleanField("Из регламента", default=False)
    is_cancelled = models.BooleanField("Отменена", default=False)
    cancel_reason = models.TextField("Причина отмены", blank=True)

    class Meta:
        verbose_name = "Позиция ТО транспорта"
        verbose_name_plural = "Позиции ТО транспорта"
        ordering = ["id"]

    def __str__(self):
        return f"{self.get_kind_display()} «{self.name}» × {self.quantity}"
