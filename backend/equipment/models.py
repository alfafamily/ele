from django.db import models
from simple_history.models import HistoricalRecords


class EquipmentType(models.Model):
    """Тип оборудования — классификатор, задающий набор реквизитов."""

    name = models.CharField("Наименование", max_length=255)
    is_archived = models.BooleanField("Архивный", default=False)

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

    equipment_type = models.ForeignKey(EquipmentType, on_delete=models.CASCADE, related_name="fields")
    name = models.CharField("Наименование реквизита", max_length=255)
    value_type = models.CharField("Значение типа", max_length=10, choices=ValueType.choices)
    is_required = models.BooleanField("Обязательность", default=False)
    # «Модель» — нельзя удалить/переименовать/сделать обязательным.
    is_locked = models.BooleanField(default=False)

    class Meta:
        verbose_name = "Реквизит типа оборудования"
        verbose_name_plural = "Реквизиты типа оборудования"

    def __str__(self):
        return f"{self.equipment_type.name} / {self.name}"


class Equipment(models.Model):
    """Единица физического актива компании."""

    inventory_number = models.CharField("Учётный номер", max_length=255)
    employee = models.ForeignKey(
        "employees.Employee", verbose_name="Сотрудник",
        on_delete=models.SET_NULL, null=True, blank=True, related_name="equipment",
    )
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
