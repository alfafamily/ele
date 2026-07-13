from django.db import models
from django.db.models import ProtectedError
from simple_history.models import HistoricalRecords


class LicenseType(models.Model):
    """Тип лицензии — классификатор реквизитов, не используется как имя объекта (ТЗ §3.7).

    Два базовых типа («Программная», «Аппаратная») сеются data-миграцией с
    is_locked=True — физически не удаляются/не архивируются, имя не редактируется.
    """

    name = models.CharField("Наименование", max_length=255)
    is_archived = models.BooleanField("Архивный", default=False)
    is_locked = models.BooleanField(default=False)

    class Meta:
        verbose_name = "Тип лицензии"
        verbose_name_plural = "Типы лицензий"
        ordering = ["name"]

    def __str__(self):
        return self.name

    def delete(self, *args, **kwargs):
        if self.is_locked:
            raise ProtectedError("Базовый Тип лицензии нельзя удалить (ТЗ §3.7).", {self})
        super().delete(*args, **kwargs)


class LicenseTypeField(models.Model):
    """Реквизит типа лицензии (ТЗ §3.7) — EAV-схема значений, см. LicenseFieldValue."""

    class ValueType(models.TextChoices):
        BOOL = "bool", "Булево"
        TEXT = "text", "Текст"
        INT = "int", "Целое число"
        FLOAT = "float", "Дробное число"
        FILE = "file", "Файл"

    license_type = models.ForeignKey(LicenseType, on_delete=models.CASCADE, related_name="fields")
    name = models.CharField("Наименование реквизита", max_length=255)
    value_type = models.CharField("Значение типа", max_length=10, choices=ValueType.choices)
    is_required = models.BooleanField("Обязательность", default=False)
    # «Номер/ключ» у базового Типа «Программная» — нельзя удалить/переименовать/
    # сделать необязательным, маскируется в UI (§3.7, Фаза 8).
    is_locked = models.BooleanField(default=False)

    class Meta:
        verbose_name = "Реквизит типа лицензии"
        verbose_name_plural = "Реквизиты типа лицензии"

    def __str__(self):
        return f"{self.license_type.name} / {self.name}"

    def delete(self, *args, **kwargs):
        if self.is_locked:
            raise ProtectedError("Зафиксированный реквизит нельзя удалить (ТЗ §3.7).", {self})
        super().delete(*args, **kwargs)


class License(models.Model):
    """Лицензия — идентифицируется собственным Наименованием, не Типом (ТЗ §3.6)."""

    name = models.CharField("Наименование", max_length=255)
    equipment = models.ForeignKey(
        "equipment.Equipment", verbose_name="Оборудование",
        on_delete=models.SET_NULL, null=True, blank=True, related_name="licenses",
    )
    is_retired = models.BooleanField("Признак утилизации", default=False)
    # Проставляется в момент утилизации (utilize action) — нужна для колонки
    # «Дата утилизации» вкладки Архив (§5.7), отдельно от is_retired.
    retired_at = models.DateTimeField("Дата утилизации", null=True, blank=True)
    # PROTECT: удаление Типа с привязанными объектами запрещено (ТЗ §5.4).
    license_type = models.ForeignKey(
        LicenseType, verbose_name="Тип лицензии", on_delete=models.PROTECT, related_name="licenses",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    history = HistoricalRecords()

    class Meta:
        verbose_name = "Лицензия"
        verbose_name_plural = "Лицензии"
        ordering = ["-created_at"]

    def __str__(self):
        return self.name


class LicenseFieldValue(models.Model):
    """Значение реквизита Типа для конкретной Лицензии (EAV)."""

    license = models.ForeignKey(License, on_delete=models.CASCADE, related_name="field_values")
    field = models.ForeignKey(LicenseTypeField, on_delete=models.CASCADE, related_name="values")
    value_text = models.TextField(null=True, blank=True)
    value_bool = models.BooleanField(null=True, blank=True)
    value_int = models.IntegerField(null=True, blank=True)
    value_float = models.FloatField(null=True, blank=True)
    # Не более 20 МБ — валидация в сериализаторе. FK на StoredFile (§8.3, Фаза 5).
    value_file = models.ForeignKey(
        "storage.StoredFile", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    # История изменений реквизитов Типа для «Истории изменений» карточки (§5.8).
    history = HistoricalRecords()

    class Meta:
        verbose_name = "Значение реквизита лицензии"
        verbose_name_plural = "Значения реквизитов лицензии"
        constraints = [
            models.UniqueConstraint(fields=["license", "field"], name="uniq_license_field_value"),
        ]

    def __str__(self):
        return f"{self.license} / {self.field.name}"


class LicenseCustomField(models.Model):
    """Произвольное текстовое поле, созданное пользователем для конкретного объекта (§3.6)."""

    license = models.ForeignKey(License, on_delete=models.CASCADE, related_name="custom_fields")
    name = models.CharField("Наименование", max_length=255)
    value = models.TextField("Значение", blank=True)
    history = HistoricalRecords()

    class Meta:
        verbose_name = "Дополнительное поле лицензии"
        verbose_name_plural = "Дополнительные поля лицензии"

    def __str__(self):
        return f"{self.license} / {self.name}"
