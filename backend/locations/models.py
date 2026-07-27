from django.db import models
from simple_history.models import HistoricalRecords


class Building(models.Model):
    """Здание — верхний уровень справочника Помещений.

    Справочник переиспользуется: сейчас к зданиям привязываются Пропуска
    сотрудников (employees.AccessPass), в дальнейшем — Оборудование. Поэтому
    здания/помещения/места физически не удаляются (иначе рвались бы ссылки),
    а только архивируются: is_archived=True прячет их из выбора, но сохраняет
    историю. Архивирование каскадится вниз — см. LocationsService.archive_building.
    """

    name = models.CharField("Наименование", max_length=255)
    address = models.CharField("Адрес", max_length=500, blank=True)
    # Число этажей — справочно; может отсутствовать (не всегда известно).
    floor_count = models.PositiveSmallIntegerField("Этажность", null=True, blank=True)
    # Здание требует персонального ключа/пропуска: только такие здания можно
    # выбрать как объект доступа при создании ключа/пропуска (employees.AccessPass).
    # Флаг независим от аналогичных флагов у помещений/мест (B15).
    requires_pass = models.BooleanField("Требуется ключ/пропуск", default=False)
    is_archived = models.BooleanField("В архиве", default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    history = HistoricalRecords()

    class Meta:
        verbose_name = "Здание"
        verbose_name_plural = "Здания"
        ordering = ["name"]

    def __str__(self):
        return self.name


class Room(models.Model):
    """Помещение/зона (кабинет, переговорка, зона) — принадлежит одному Зданию.

    Помещение может быть парковкой (parking_type):
    - ''        — обычное помещение/зона; внутри — рабочие места/склады (Place);
    - 'adjacent' — Прилегающая парковка (снаружи здания, рядом): этажа нет,
      можно приложить план и признак «требуется ключ/пропуск»;
    - 'floor'    — Этаж-парковка: обычное помещение/зона, отмеченное как парковка;
      этаж обязателен и уникален среди этаж-парковок здания.
    У парковки (любого вида) вложенные Place — это Парковочные места
    (place_type=parking_spot), за которыми закрепляется транспорт/личные авто.
    """

    class ParkingType(models.TextChoices):
        ADJACENT = "adjacent", "Прилегающая парковка"
        FLOOR = "floor", "Этаж-парковка"

    building = models.ForeignKey(
        Building, verbose_name="Здание", on_delete=models.PROTECT, related_name="rooms",
    )
    name = models.CharField("Название/номер", max_length=255)
    # Номер этажа — строка, а не число: бывает «1А», «-1P», «-1 Паркинг».
    # Всегда начинается с цифр (в т.ч. отрицательных) — используется при
    # сортировке помещений внутри здания (см. sorting.room_sort_key).
    floor = models.CharField("Номер этажа", max_length=16, blank=True)
    # Вид парковки; пусто — обычное помещение/зона (не парковка).
    parking_type = models.CharField(
        "Вид парковки", max_length=10, choices=ParkingType.choices, blank=True, default="",
    )
    # План парковки (PDF/изображение) — только для помещений-парковок.
    plan_file = models.ForeignKey(
        "storage.StoredFile", verbose_name="План парковки",
        on_delete=models.SET_NULL, null=True, blank=True, related_name="+",
    )
    # Помещение требует персонального ключа/пропуска — только такие помещения
    # можно выбрать как объект доступа ключа/пропуска (B15). Независим от флага
    # здания-родителя и от флагов вложенных мест.
    requires_pass = models.BooleanField("Требуется ключ/пропуск", default=False)
    is_archived = models.BooleanField("В архиве", default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    history = HistoricalRecords()

    class Meta:
        verbose_name = "Помещение/зона"
        verbose_name_plural = "Помещения/зоны"
        ordering = ["name"]
        constraints = [
            # Не может быть двух этаж-парковок с одним номером этажа в здании.
            models.UniqueConstraint(
                fields=["building", "floor"],
                condition=models.Q(parking_type="floor"),
                name="uniq_floor_parking_per_building",
            ),
        ]

    def __str__(self):
        return self.name

    @property
    def is_parking(self):
        return bool(self.parking_type)


class Place(models.Model):
    """Место (рабочее место/точка) — принадлежит одному Помещению.

    Тип места (place_type) задаёт роль места в учёте размещения объектов (B8):
    - workplace (Рабочее место) — на него можно закрепить Оборудование/Инструмент
      стационарно (без конкретного сотрудника) и закрепить самих сотрудников;
    - storage (Место хранения) — «склад», куда кладётся свободный (никому не
      выданный) остаток объектов; свободный объект всегда лежит на складе.
    Флаг requires_pass независим от типа — место любого типа может требовать
    персональный ключ/пропуск (и независим от одноимённых флагов у
    здания/помещения-родителей, см. B15).
    """

    class PlaceType(models.TextChoices):
        WORKPLACE = "workplace", "Рабочее место"
        STORAGE = "storage", "Место хранения"
        PARKING_SPOT = "parking_spot", "Парковочное место"

    room = models.ForeignKey(
        Room, verbose_name="Помещение/зона", on_delete=models.PROTECT, related_name="places",
    )
    name = models.CharField("Название/номер", max_length=255)
    place_type = models.CharField(
        "Тип места", max_length=12, choices=PlaceType.choices, default=PlaceType.WORKPLACE,
    )
    # Для place_type=workplace — сотрудники, закреплённые за рабочим местом.
    # Для place_type=parking_spot — владельцы личных авто, стоящих на месте
    # («Личный авто»). Для склада не используется. Для парковочного места
    # взаимоисключающе с transport (личные авто ЛИБО транспорт компании).
    employees = models.ManyToManyField(
        "employees.Employee", verbose_name="Сотрудники", blank=True, related_name="workplaces",
    )
    # Только для place_type=parking_spot — транспорт компании, закреплённый за
    # парковочным местом («Транспорт компании»). Взаимоисключающе с employees.
    transport = models.ManyToManyField(
        "transport.Transport", verbose_name="Транспорт", blank=True, related_name="parking_spots",
    )
    # Место требует персонального ключа/пропуска: только такие места можно
    # выбрать как объект доступа при создании ключа/пропуска (employees.AccessPass).
    requires_pass = models.BooleanField("Требуется ключ/пропуск", default=False)
    is_archived = models.BooleanField("В архиве", default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    history = HistoricalRecords(m2m_fields=[employees, transport])

    class Meta:
        verbose_name = "Место"
        verbose_name_plural = "Места"
        ordering = ["name"]

    def __str__(self):
        return self.name
