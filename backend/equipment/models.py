from django.db import models
from simple_history.models import HistoricalRecords


class EquipmentType(models.Model):
    """Тип оборудования — классификатор, задающий набор реквизитов."""

    class AccountingType(models.TextChoices):
        # Поэкземплярный — одна карточка = один физический экземпляр (employee — FK).
        # Количественный — карточка = N одинаковых единиц (остаток + раздача по
        # частям через EquipmentAllocation; см.).
        INSTANCE = "instance", "Поэкземплярный"
        QUANTITY = "quantity", "Количественный"

    name = models.CharField("Наименование", max_length=255)
    is_archived = models.BooleanField("Архивный", default=False)
    # Вид учёта. Существующие Типы при миграции получают «Поэкземплярный» (default),
    # поведение не меняется. Смену запрещаем, когда у Типа уже есть объекты
    # (валидация в EquipmentTypeSerializer).
    accounting_type = models.CharField(
        "Вид учёта", max_length=10, choices=AccountingType.choices, default=AccountingType.INSTANCE
    )

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
    # Единичное закрепление — только для поэкземплярного учёта. У количественных
    # Типов остаётся null, раздача ведётся через EquipmentAllocation (см.).
    employee = models.ForeignKey(
        "employees.Employee", verbose_name="Сотрудник",
        on_delete=models.SET_NULL, null=True, blank=True, related_name="equipment",
    )
    # Остаток (всего единиц в системе) — только для количественного учёта. У
    # поэкземплярных Типов остаётся 0 и не используется. «Свободно» = quantity −
    # сумма закреплений (EquipmentAllocation).
    quantity = models.PositiveIntegerField("Остаток", default=0)
    is_written_off = models.BooleanField("Признак списания", default=False)
    # Проставляется в момент списания (write_off action) — нужна для колонки
    # «Дата списания» вкладки Архив, отдельно от is_written_off.
    written_off_at = models.DateTimeField("Дата списания", null=True, blank=True)
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


class EquipmentAllocation(models.Model):
    """Закрепление части единиц количественной карточки за сотрудником.
    Одна строка на пару (equipment, employee); количество агрегируется.
    Свободный остаток = Equipment.quantity − сумма quantity всех закреплений."""

    # PROTECT на employee: пока за сотрудником закреплены единицы — его нельзя
    # удалить (как и с поэкземплярным оборудованием).
    equipment = models.ForeignKey(Equipment, on_delete=models.CASCADE, related_name="allocations")
    employee = models.ForeignKey(
        "employees.Employee", verbose_name="Сотрудник",
        on_delete=models.PROTECT, related_name="equipment_allocations",
    )
    quantity = models.PositiveIntegerField("Количество")

    class Meta:
        verbose_name = "Закрепление количественного оборудования"
        verbose_name_plural = "Закрепления количественного оборудования"
        constraints = [
            models.UniqueConstraint(fields=["equipment", "employee"], name="uniq_equipment_allocation"),
        ]

    def __str__(self):
        return f"{self.equipment} / {self.employee} × {self.quantity}"


class EquipmentMovement(models.Model):
    """Журнал движений количественной карточки — источник «истории движений по
    количеству». Пишется транзакционно вместе с изменением остатка/закреплений.
    Текущее состояние хранят Equipment.quantity и EquipmentAllocation."""

    class Kind(models.TextChoices):
        ADD = "add", "Приход"
        WRITE_OFF = "write_off", "Списание"
        ASSIGN = "assign", "Закрепление"
        UNASSIGN = "unassign", "Открепление"

    equipment = models.ForeignKey(Equipment, on_delete=models.CASCADE, related_name="movements")
    kind = models.CharField("Тип движения", max_length=10, choices=Kind.choices)
    quantity = models.PositiveIntegerField("Количество")
    # Заполняется для assign/unassign. SET_NULL — движение остаётся в истории даже
    # если сотрудник когда-нибудь будет удалён.
    employee = models.ForeignKey(
        "employees.Employee", verbose_name="Сотрудник",
        on_delete=models.SET_NULL, null=True, blank=True, related_name="+",
    )
    comment = models.TextField("Комментарий", blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(
        "accounts.User", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )

    class Meta:
        verbose_name = "Движение количественного оборудования"
        verbose_name_plural = "Движения количественного оборудования"
        ordering = ["created_at", "id"]

    def __str__(self):
        return f"{self.equipment} / {self.get_kind_display()} × {self.quantity}"
