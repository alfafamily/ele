from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType
from django.db import models
from django.db.models import Q
from django.utils import timezone
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


class EmployeeDuplicateDismissal(models.Model):
    """Пометка «не дубль» для конкретного набора сотрудников-тёзок (B12).

    Ключуется точным составом группы (signature — отсортированные id через
    запятую). Изменился состав группы (появился/убыл тёзка) — подпись другая,
    и группа снова считается возможным дублем. Снятие пометки — удаление записи."""

    signature = models.CharField("Подпись группы", max_length=255, unique=True)
    member_ids = models.JSONField("Участники", default=list)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(
        "accounts.User", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )

    class Meta:
        verbose_name = "Пометка «не дубль»"
        verbose_name_plural = "Пометки «не дубль»"

    def __str__(self):
        return self.signature


class EmployeeAssignment(models.Model):
    """B32. Эпизод закрепления объекта за сотрудником + статус акцепта.

    Отдельная сущность (а не поля на объекте), потому что статус акцепта подчинён
    движению закрепления и меняется во времени до финального. Один объект в один
    момент имеет максимум один ОТКРЫТЫЙ эпизод (`closed_at is null`). Объект —
    через GenericForeignKey (Оборудование/SIM/Пропуск/Инструмент), чтобы одна
    модель обслуживала все разделы без циклов импорта.

    Статусы:
      • pending — у сотрудника есть пользователь, он ещё не решил;
      • in_absentia — у сотрудника нет пользователя (заочно), финальный до увязки;
      • accepted / rejected — пользователь подтвердил / отклонил.
    `was_in_absentia` — эпизод был заочным и стал pending после увязки пользователя
    (для показа обеих строк в истории). Рабочие места эпизодов НЕ создают.
    """

    class Status(models.TextChoices):
        PENDING = "pending", "Ожидает подтверждения сотрудника"
        IN_ABSENTIA = "in_absentia", "Закреплено заочно"
        ACCEPTED = "accepted", "Закрепление подтверждено сотрудником"
        REJECTED = "rejected", "Закрепление отклонено сотрудником"
        # B32: объект перезакреплён/откреплён ответственным до решения сотрудника —
        # решение больше не требуется (в отличие от rejected — там решил сотрудник).
        CANCELLED = "cancelled", "Передача отменена ответственным"

    class ObjectKind(models.TextChoices):
        EQUIPMENT = "equipment", "Оборудование"
        SIM = "sim", "SIM-карта"
        PASS = "pass", "Пропуск/Ключ"
        TOOL = "tool", "Инструмент"
        TRANSPORT = "transport", "Транспорт"

    content_type = models.ForeignKey(ContentType, on_delete=models.CASCADE, related_name="+")
    object_id = models.PositiveIntegerField()
    content_object = GenericForeignKey("content_type", "object_id")
    # Денормализация вида объекта — для списка контрольного подраздела и фильтров
    # без джойна к content_type.
    object_kind = models.CharField("Вид объекта", max_length=10, choices=ObjectKind.choices)

    employee = models.ForeignKey(
        Employee, verbose_name="Сотрудник", on_delete=models.PROTECT, related_name="assignments"
    )
    status = models.CharField("Статус акцепта", max_length=12, choices=Status.choices)
    was_in_absentia = models.BooleanField("Было заочным", default=False)

    assigned_by = models.ForeignKey(
        "accounts.User", verbose_name="Кто закрепил", on_delete=models.SET_NULL,
        null=True, blank=True, related_name="+",
    )
    # Не auto_now_add — data-миграция проставляет дату из истории закрепления.
    assigned_at = models.DateTimeField("Дата закрепления", default=timezone.now)
    decided_by = models.ForeignKey(
        "accounts.User", verbose_name="Кто принял решение", on_delete=models.SET_NULL,
        null=True, blank=True, related_name="+",
    )
    decided_at = models.DateTimeField("Дата решения", null=True, blank=True)
    # Комментарий сотрудника к решению — обязателен при отказе (причина), попадает
    # в строку статуса в истории.
    decision_comment = models.TextField("Комментарий к решению", blank=True)

    # Куда вернуть объект при отказе — снимок размещения ДО закрепления
    # (склад / рабочее место; NULL = «Без склада»/виртуальное хранение).
    return_place = models.ForeignKey(
        "locations.Place", verbose_name="Вернуть на", on_delete=models.SET_NULL,
        null=True, blank=True, related_name="+",
    )
    # Для инструментов (количественный учёт) — сколько единиц вернуть на склад.
    return_quantity = models.PositiveIntegerField("Кол-во к возврату", null=True, blank=True)

    # Слепок устройства при решении (если включён флаг компании).
    device_snapshot = models.JSONField("Слепок устройства", null=True, blank=True)

    # Эпизод закрыт: объект откреплён/переназначен/списан/утилизирован или отклонён.
    closed_at = models.DateTimeField("Эпизод закрыт", null=True, blank=True)

    class Meta:
        verbose_name = "Закрепление за сотрудником"
        verbose_name_plural = "Закрепления за сотрудниками"
        ordering = ["-assigned_at", "-id"]
        indexes = [
            models.Index(fields=["content_type", "object_id", "closed_at"]),
            models.Index(fields=["employee", "closed_at"]),
        ]

    @property
    def is_open(self):
        return self.closed_at is None

    def __str__(self):
        return f"{self.get_object_kind_display()} #{self.object_id} → {self.employee} ({self.status})"


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
    # Размещение (B8): SIM закрепляется за сотрудником ИЛИ за оборудованием
    # (симка в модеме для резервного канала). Не более одного из
    # {employee, equipment}. Свободная (не за сотрудником и не за оборудованием)
    # лежит на складе — storage_place; legacy-записи допускают NULL.
    equipment = models.ForeignKey(
        "equipment.Equipment", verbose_name="Оборудование", on_delete=models.SET_NULL,
        null=True, blank=True, related_name="sim_cards",
    )
    storage_place = models.ForeignKey(
        "locations.Place", verbose_name="Место хранения", on_delete=models.SET_NULL,
        null=True, blank=True, related_name="+",
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
        # «Неиспользуемая»: не за сотрудником и не в оборудовании, но не
        # утилизирована (лежит свободной на складе).
        return self.employee_id is None and self.equipment_id is None and not self.is_utilized

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
        VEHICLE = "vehicle", "Личный авто"
        PEDESTRIAN = "pedestrian", "Пеший"

    class ObjectType(models.TextChoices):
        PASS = "pass", "Пропуск СКУД"
        KEY = "key", "Ключ"

    class PassKind(models.TextChoices):
        # Вид пропуска СКУД (B34). Персональный — за сотрудником (Личный авто /
        # Пеший, доступ в здания/помещения/места). Транспортный — за единицей
        # транспорта компании, доступ только на уровне зданий целиком.
        PERSONAL = "personal", "Персональный"
        TRANSPORT = "transport", "Транспортный"

    class UtilizationReason(models.TextChoices):
        UTILIZED = "utilized", "Утилизирован"
        HANDED = "handed", "Передан арендодателю"

    # Тип объекта учёта: пропуск СКУД или физический ключ от замка. У ключа
    # доступ ограничен ровно одним объектом (одно здание ИЛИ одно помещение),
    # без Названия; остальная механика — как у пропуска.
    object_type = models.CharField(
        "Вид средства", max_length=8, choices=ObjectType.choices, default=ObjectType.PASS
    )
    # Вид пропуска (B34): персональный (за сотрудником) или транспортный (за
    # единицей транспорта). Для ключей всегда «персональный» и не используется.
    pass_kind = models.CharField(
        "Вид пропуска", max_length=10, choices=PassKind.choices, default=PassKind.PERSONAL
    )
    employee = models.ForeignKey(
        Employee, verbose_name="Сотрудник", on_delete=models.SET_NULL,
        null=True, blank=True, related_name="passes",
    )
    # Транспортный пропуск закрепляется за единицей транспорта (аналог employee у
    # персонального). Открепление → transport=NULL, объект уходит на склад.
    transport = models.ForeignKey(
        "transport.Transport", verbose_name="Транспорт", on_delete=models.SET_NULL,
        null=True, blank=True, related_name="passes",
    )
    # Размещение (B8): свободный (не за сотрудником) пропуск/ключ лежит на складе.
    # legacy-записи допускают NULL. Не путать с M2M `places` — это объекты
    # доступа (какие места открывает пропуск), а не место хранения.
    storage_place = models.ForeignKey(
        "locations.Place", verbose_name="Место хранения", on_delete=models.SET_NULL,
        null=True, blank=True, related_name="+",
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
    # Тип пропуска (персонального): Личный авто и/или Пеший, можно оба, можно
    # ни одного. Для транспортного пропуска не используется.
    type_vehicle = models.BooleanField("Личный авто", default=False)
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
        # «Неиспользуемый»: не закреплён (ни за сотрудником, ни за транспортом) и
        # не утилизирован.
        return self.employee_id is None and self.transport_id is None and not self.is_utilized

    def __str__(self):
        if self.object_type == self.ObjectType.KEY:
            return self.account_number or f"Ключ #{self.pk}"
        return self.account_number or f"Пропуск #{self.pk}"
