from django.db import models
from simple_history.models import HistoricalRecords


class Tool(models.Model):
    """Инструмент — учётный объект с количественным учётом: одна карточка
    описывает N одинаковых единиц (расходники, недорогой инструмент). У объекта
    только наименование и произвольные доп. поля — типов и реквизитов типов нет.

    Учёт остатка/движений/раздачи по частям аналогичен тому, что раньше жил у
    количественного оборудования (перенесено сюда): Остаток = Свободно +
    Закреплено; раздача по частям — через ToolAllocation, журнал — ToolMovement.
    """

    name = models.CharField("Наименование", max_length=255)
    quantity = models.PositiveIntegerField("Остаток", default=0)
    is_written_off = models.BooleanField("Признак списания", default=False)
    written_off_at = models.DateTimeField("Дата списания", null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    history = HistoricalRecords()

    class Meta:
        verbose_name = "Инструмент"
        verbose_name_plural = "Инструменты"
        ordering = ["-created_at"]

    def __str__(self):
        return self.name


class ToolCustomField(models.Model):
    """Произвольное поле инструмента (наименование + значение)."""

    tool = models.ForeignKey(Tool, on_delete=models.CASCADE, related_name="custom_fields")
    name = models.CharField("Наименование", max_length=255)
    value = models.TextField("Значение", blank=True)
    history = HistoricalRecords()

    class Meta:
        verbose_name = "Дополнительное поле инструмента"
        verbose_name_plural = "Дополнительные поля инструмента"

    def __str__(self):
        return f"{self.tool} / {self.name}"


class ToolAllocation(models.Model):
    """Закрепление части единиц инструмента за сотрудником. Одна строка на пару
    (tool, employee); количество агрегируется. Свободный остаток =
    Tool.quantity − сумма quantity всех закреплений."""

    tool = models.ForeignKey(Tool, on_delete=models.CASCADE, related_name="allocations")
    employee = models.ForeignKey(
        "employees.Employee", verbose_name="Сотрудник",
        on_delete=models.PROTECT, related_name="tool_allocations",
    )
    quantity = models.PositiveIntegerField("Количество")

    class Meta:
        verbose_name = "Закрепление инструмента"
        verbose_name_plural = "Закрепления инструмента"
        constraints = [
            models.UniqueConstraint(fields=["tool", "employee"], name="uniq_tool_allocation"),
        ]

    def __str__(self):
        return f"{self.tool} / {self.employee} × {self.quantity}"


class ToolMovement(models.Model):
    """Журнал движений инструмента — источник «истории движений по количеству».
    Пишется транзакционно вместе с изменением остатка/закреплений."""

    class Kind(models.TextChoices):
        ADD = "add", "Приход"
        WRITE_OFF = "write_off", "Списание"
        ASSIGN = "assign", "Закрепление"
        UNASSIGN = "unassign", "Открепление"

    tool = models.ForeignKey(Tool, on_delete=models.CASCADE, related_name="movements")
    kind = models.CharField("Тип движения", max_length=10, choices=Kind.choices)
    quantity = models.PositiveIntegerField("Количество")
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
        verbose_name = "Движение инструмента"
        verbose_name_plural = "Движения инструмента"
        ordering = ["created_at", "id"]

    def __str__(self):
        return f"{self.tool} / {self.get_kind_display()} × {self.quantity}"
