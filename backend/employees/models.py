from django.db import models
from django.db.models import Q
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
    """Корпоративная SIM/E-SIM — самостоятельный переиспользуемый объект.

    Номер телефона уникален по всем записям: один объект передаётся от
    сотрудника к сотруднику через привязку/отвязку (employee). Статус
    вычисляется по привязке: закреплена за сотрудником ⇒ активна, отвязана
    (employee=NULL) ⇒ деактивирована. Отдельного флага нет.
    """

    class SimType(models.TextChoices):
        SIM = "sim", "SIM"
        ESIM = "esim", "E-SIM"

    employee = models.ForeignKey(
        Employee, verbose_name="Сотрудник", on_delete=models.SET_NULL,
        null=True, blank=True, related_name="sim_cards",
    )
    # Утилизация — необратимый статус (аналог списания Оборудования). Отвязанная,
    # но не утилизированная карта — «Неиспользуемая», может быть выдана снова;
    # утилизированная — уходит в отдельный таб и не возвращается.
    is_utilized = models.BooleanField("Утилизирована", default=False)
    utilized_at = models.DateTimeField("Дата утилизации", null=True, blank=True)
    sim_type = models.CharField("Тип", max_length=8, choices=SimType.choices, default=SimType.SIM)
    phone_number = models.CharField("Номер телефона", max_length=32)
    # Оператор сети, в которой физически работает SIM. Free-text с
    # автоподсказкой по встречавшимся значениям (эндпоинт operators), без
    # отдельного справочника — как «Отдел» у Сотрудника.
    network_operator = models.CharField("Оператор", max_length=255, blank=True)
    # Поставщик услуг связи — через кого управление номером (пополнение, смена
    # тарифа, договор). Не всегда совпадает с Оператором (MVNO/дилер).
    provider = models.CharField("Поставщик услуг связи", max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    history = HistoricalRecords()

    class Meta:
        verbose_name = "SIM-карта"
        verbose_name_plural = "SIM-карты"
        ordering = ["-created_at"]
        constraints = [
            # Номер уникален по всем SIM (активным и деактивированным).
            models.UniqueConstraint(fields=["phone_number"], name="uniq_sim_phone"),
        ]

    @property
    def is_deactivated(self):
        # «Неиспользуемая»: отвязана, но не утилизирована.
        return self.employee_id is None and not self.is_utilized

    def __str__(self):
        return self.phone_number


class AccessPass(models.Model):
    """Физический пропуск СКУД — самостоятельный переиспользуемый объект.

    Механика 1:1 как у SimCard: выдаётся admin/accountant, привязывается к
    сотруднику (активен) и отвязывается (деактивирован, employee=NULL). Учётный
    номер необязательный: если пустой — уникальность не проверяется (может быть
    N пропусков без номера), если заполнен — уникален. Пропуск действует в одном
    или нескольких зданиях; набор Помещений — необязательный: если ни одного не
    выбрано, пропуск действует на все помещения здания.
    """

    class PassType(models.TextChoices):
        VEHICLE = "vehicle", "Авто"
        PEDESTRIAN = "pedestrian", "Пеший"

    class ObjectType(models.TextChoices):
        PASS = "pass", "Пропуск СКУД"
        KEY = "key", "Ключ"

    class UtilizationReason(models.TextChoices):
        UTILIZED = "utilized", "Утилизирован"
        HANDED = "handed", "Передан арендодателю"

    # Тип объекта учёта: пропуск СКУД или физический ключ от замка. У ключа
    # доступ ограничен ровно одним объектом (одно здание ИЛИ одно помещение),
    # без Названия; остальная механика — как у пропуска.
    object_type = models.CharField(
        "Тип объекта", max_length=8, choices=ObjectType.choices, default=ObjectType.PASS
    )
    employee = models.ForeignKey(
        Employee, verbose_name="Сотрудник", on_delete=models.SET_NULL,
        null=True, blank=True, related_name="passes",
    )
    # Утилизация — необратимый статус. Отвязанный, но не утилизированный объект —
    # «Неиспользуемый»; утилизированный (выброшен / передан арендодателю) уходит в
    # отдельный таб и не возвращается.
    is_utilized = models.BooleanField("Утилизирован", default=False)
    utilized_at = models.DateTimeField("Дата утилизации", null=True, blank=True)
    utilization_reason = models.CharField(
        "Причина утилизации", max_length=8, choices=UtilizationReason.choices, blank=True
    )
    # Учётный номер физической карточки — необязательный (карту могли выдать
    # без нанесённого номера).
    account_number = models.CharField("Учётный номер", max_length=64, blank=True)
    # Тип пропуска: Авто и/или Пеший, можно оба, можно ни одного.
    type_vehicle = models.BooleanField("Авто", default=False)
    type_pedestrian = models.BooleanField("Пеший", default=False)
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
    # Конкретные места (точки) — самый узкий объект доступа. Выбираются только
    # среди мест с флагом requires_pass; место относится к выбранному помещению
    # своего здания. У ключа объект доступа один: здание ИЛИ помещение ИЛИ место.
    places = models.ManyToManyField(
        "locations.Place", verbose_name="Места", blank=True, related_name="+",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    history = HistoricalRecords(m2m_fields=[buildings, rooms, places])

    class Meta:
        verbose_name = "Пропуск"
        verbose_name_plural = "Пропуска"
        ordering = ["-created_at"]
        constraints = [
            # Учётный номер уникален в разрезе типа объекта и только среди
            # непустых (частичный индекс): у пропусков и ключей независимые
            # пространства номеров — один и тот же номер может быть и у ключа,
            # и у пропуска.
            models.UniqueConstraint(
                fields=["object_type", "account_number"],
                condition=~Q(account_number=""),
                name="uniq_pass_account",
            ),
        ]

    @property
    def is_deactivated(self):
        # «Неиспользуемый»: отвязан, но не утилизирован.
        return self.employee_id is None and not self.is_utilized

    def __str__(self):
        if self.object_type == self.ObjectType.KEY:
            return self.account_number or f"Ключ #{self.pk}"
        return self.account_number or f"Пропуск #{self.pk}"
