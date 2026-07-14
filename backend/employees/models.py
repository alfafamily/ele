from django.db import models


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
