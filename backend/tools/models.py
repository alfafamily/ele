from django.db import models
from django.db.models import Q
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
    """Размещение части единиц инструмента (B8). Ровно один из target-ов:
    - employee — закреплено мобильно за сотрудником;
    - place с типом workplace — закреплено стационарно за рабочим местом;
    - place с типом storage — свободный остаток, лежащий на этом складе.

    Одна строка на пару (tool, target); количество агрегируется. Инвариант:
    сумма quantity всех размещений == Tool.quantity (каждая единица всегда
    где-то лежит). «Свободно» = сумма по storage-местам; «Закреплено» =
    сумма по сотрудникам и рабочим местам."""

    tool = models.ForeignKey(Tool, on_delete=models.CASCADE, related_name="allocations")
    employee = models.ForeignKey(
        "employees.Employee", verbose_name="Сотрудник",
        on_delete=models.PROTECT, null=True, blank=True, related_name="tool_allocations",
    )
    place = models.ForeignKey(
        "locations.Place", verbose_name="Место",
        on_delete=models.PROTECT, null=True, blank=True, related_name="tool_allocations",
    )
    quantity = models.PositiveIntegerField("Количество")

    class Meta:
        verbose_name = "Размещение инструмента"
        verbose_name_plural = "Размещения инструмента"
        constraints = [
            models.UniqueConstraint(
                fields=["tool", "employee"], condition=Q(employee__isnull=False),
                name="uniq_tool_allocation_employee",
            ),
            models.UniqueConstraint(
                fields=["tool", "place"], condition=Q(place__isnull=False),
                name="uniq_tool_allocation_place",
            ),
            models.CheckConstraint(
                condition=Q(employee__isnull=False, place__isnull=True)
                | Q(employee__isnull=True, place__isnull=False),
                name="tool_allocation_exactly_one_target",
            ),
        ]

    @property
    def target_kind(self):
        # employee — мобильно; workplace — стационарно; storage — свободно на складе.
        if self.employee_id:
            return "employee"
        if self.place and self.place.place_type == "workplace":
            return "workplace"
        return "storage"

    def __str__(self):
        return f"{self.tool} / {self.employee or self.place} × {self.quantity}"


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
    # Контрагент-место движения: для ADD/WRITE_OFF — склад прихода/списания;
    # для ASSIGN/UNASSIGN стационарного — рабочее место. См. ToolAllocation.
    place = models.ForeignKey(
        "locations.Place", verbose_name="Место",
        on_delete=models.SET_NULL, null=True, blank=True, related_name="+",
    )
    # Склад-источник (ASSIGN) / склад-приёмник (UNASSIGN) — откуда/куда
    # перекладывается свободный остаток при раздаче/возврате.
    storage_place = models.ForeignKey(
        "locations.Place", verbose_name="Склад",
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
