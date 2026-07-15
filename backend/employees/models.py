from django.db import models
from simple_history.models import HistoricalRecords


class Employee(models.Model):
    """Сотрудник — физическое лицо в компании, не обязательно с учёткой."""

    first_name = models.CharField("Имя", max_length=150)
    last_name = models.CharField("Фамилия", max_length=150)
    position = models.CharField("Должность", max_length=255, blank=True)
    # Текст с автоподсказкой по уже встречавшимся значениям — на уровне API
    # (Фаза 4, distinct-эндпоинт), отдельного справочника «Отделы» нет.
    department = models.CharField("Отдел", max_length=255, blank=True)
    # Не более 600×600, не более 2 МБ — валидация в сериализаторе.
    # FK на StoredFile, не прямой путь к файлу (Фаза 5).
    avatar = models.ForeignKey(
        "storage.StoredFile", verbose_name="Аватар", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    is_employed = models.BooleanField("Работает", default=True)

    class Meta:
        verbose_name = "Сотрудник"
        verbose_name_plural = "Сотрудники"
        ordering = ["last_name", "first_name"]

    def __str__(self):
        return f"{self.last_name} {self.first_name}".strip()


class SimCard(models.Model):
    """Корпоративная SIM/E-SIM, закреплённая за Сотрудником.

    Отдельного справочника номеров нет: номер деактивируется при увольнении и
    не передаётся другому сотруднику, поэтому список ведётся прямо в карточке
    Сотрудника (FK). Деактивированные (архивные) симки не открепляются, а
    остаются для истории «кому какой номер выдавали» — в отличие от
    Оборудования, которое при увольнении открепляется (см. terminate).
    """

    class SimType(models.TextChoices):
        SIM = "sim", "SIM"
        ESIM = "esim", "E-SIM"

    employee = models.ForeignKey(
        Employee, verbose_name="Сотрудник", on_delete=models.CASCADE, related_name="sim_cards",
    )
    sim_type = models.CharField("Тип", max_length=8, choices=SimType.choices, default=SimType.SIM)
    phone_number = models.CharField("Номер телефона", max_length=32)
    # Оператор сети, в которой физически работает SIM. Free-text с
    # автоподсказкой по встречавшимся значениям (эндпоинт operators), без
    # отдельного справочника — как «Отдел» у Сотрудника.
    network_operator = models.CharField("Оператор", max_length=255, blank=True)
    # Поставщик услуг связи — через кого управление номером (пополнение, смена
    # тарифа, договор). Не всегда совпадает с Оператором (MVNO/дилер).
    provider = models.CharField("Поставщик услуг связи", max_length=255, blank=True)
    # Признак деактивации (архивная симка). Проставляется вручную или
    # автоматически при увольнении Сотрудника. По образцу is_written_off у
    # Оборудования / is_retired у Лицензий.
    is_deactivated = models.BooleanField("Деактивирована", default=False)
    deactivated_at = models.DateTimeField("Дата деактивации", null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    history = HistoricalRecords()

    class Meta:
        verbose_name = "SIM-карта"
        verbose_name_plural = "SIM-карты"
        # Активные выше архивных, внутри группы — новые выше.
        ordering = ["is_deactivated", "-created_at"]

    def __str__(self):
        return self.phone_number


class AccessPass(models.Model):
    """Физический пропуск СКУД, закреплённый за Сотрудником.

    Механика 1:1 как у SimCard: выдаётся admin/accountant, деактивируется
    (архивная запись), при увольнении деактивируется, но остаётся закреплённым
    за сотрудником для истории (кому какой пропуск выдавали). Пропуск всегда
    привязан к Зданию; набор Помещений — необязательный: если ни одного не
    выбрано, пропуск действует на все помещения здания.
    """

    employee = models.ForeignKey(
        Employee, verbose_name="Сотрудник", on_delete=models.CASCADE, related_name="passes",
    )
    # Учётный номер физической карточки — необязательный (карту могли выдать
    # без нанесённого номера).
    account_number = models.CharField("Учётный номер", max_length=64, blank=True)
    # Один пропуск может действовать сразу в нескольких зданиях.
    buildings = models.ManyToManyField(
        "locations.Building", verbose_name="Здания", related_name="+",
    )
    # Конкретные помещения (подмножество помещений выбранных зданий). Если для
    # какого-то из выбранных зданий не отмечено ни одного помещения — пропуск
    # действует на все его помещения.
    rooms = models.ManyToManyField(
        "locations.Room", verbose_name="Помещения/зоны", blank=True, related_name="+",
    )
    is_deactivated = models.BooleanField("Деактивирован", default=False)
    deactivated_at = models.DateTimeField("Дата деактивации", null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    history = HistoricalRecords(m2m_fields=[buildings, rooms])

    class Meta:
        verbose_name = "Пропуск"
        verbose_name_plural = "Пропуска"
        # Активные выше деактивированных, внутри группы — новые выше.
        ordering = ["is_deactivated", "-created_at"]

    def __str__(self):
        return self.account_number or f"Пропуск #{self.pk}"
