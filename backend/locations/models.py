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
    """Помещение/зона (кабинет, переговорка, зона) — принадлежит одному Зданию."""

    building = models.ForeignKey(
        Building, verbose_name="Здание", on_delete=models.PROTECT, related_name="rooms",
    )
    name = models.CharField("Название/номер", max_length=255)
    # Номер этажа — строка, а не число: бывает «1А», «-1P», «-1 Паркинг».
    # Всегда начинается с цифр (в т.ч. отрицательных) — используется при
    # сортировке помещений внутри здания (см. sorting.room_sort_key).
    floor = models.CharField("Номер этажа", max_length=16, blank=True)
    is_archived = models.BooleanField("В архиве", default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    history = HistoricalRecords()

    class Meta:
        verbose_name = "Помещение/зона"
        verbose_name_plural = "Помещения/зоны"
        ordering = ["name"]

    def __str__(self):
        return self.name


class Place(models.Model):
    """Место (рабочее место/точка) — принадлежит одному Помещению.

    Тип места (place_type) задаёт роль места в учёте размещения объектов (B8):
    - workplace (Рабочее место) — на него можно закрепить Оборудование/Инструмент
      стационарно (без конкретного сотрудника) и закрепить самих сотрудников;
    - storage (Место хранения) — «склад», куда кладётся свободный (никому не
      выданный) остаток объектов; свободный объект всегда лежит на складе.
    Флаг requires_pass независим от типа — место любого типа может требовать
    персональный ключ/пропуск.
    """

    class PlaceType(models.TextChoices):
        WORKPLACE = "workplace", "Рабочее место"
        STORAGE = "storage", "Место хранения"

    room = models.ForeignKey(
        Room, verbose_name="Помещение/зона", on_delete=models.PROTECT, related_name="places",
    )
    name = models.CharField("Название/номер", max_length=255)
    place_type = models.CharField(
        "Тип места", max_length=10, choices=PlaceType.choices, default=PlaceType.WORKPLACE,
    )
    # Сотрудники, закреплённые за рабочим местом (несколько). Осмысленно только
    # для place_type=workplace; для склада не используется.
    employees = models.ManyToManyField(
        "employees.Employee", verbose_name="Сотрудники", blank=True, related_name="workplaces",
    )
    # Место требует персонального ключа/пропуска: только такие места можно
    # выбрать как объект доступа при создании ключа/пропуска (employees.AccessPass).
    requires_pass = models.BooleanField("Требуется ключ/пропуск", default=False)
    is_archived = models.BooleanField("В архиве", default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    history = HistoricalRecords(m2m_fields=[employees])

    class Meta:
        verbose_name = "Место"
        verbose_name_plural = "Места"
        ordering = ["name"]

    def __str__(self):
        return self.name
