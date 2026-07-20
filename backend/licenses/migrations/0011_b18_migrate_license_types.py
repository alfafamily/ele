"""B18, данные: перевод прежних базовых типов и лицензий на новую модель.

1. Каждому существующему Типу проставляем вид: «Аппаратная» → hardware, все
   прочие → software. Снимаем legacy-блокировку (is_locked=False), чтобы бывшие
   базовые типы стали обычными — их можно переименовать/удалить после переноса
   объектов на пользовательские типы того же вида.
2. Каждому Типу, у которого ещё нет зафиксированного ключевого реквизита,
   досеваем его по виду («Номер/ключ» / «Номер/ID/Serial токена»).
3. Прежнее Наименование каждой лицензии переносим в доп. поле «Прежнее
   наименование», чтобы информация не потерялась (в UI имя больше не хранится).
4. Пустые (без лицензий) прежние базовые типы «Программная»/«Аппаратная»
   удаляем — на чистых установках это убирает засеянные стартовые типы, а там,
   где на них уже заведены лицензии, тип остаётся для ручного переноса.
"""
from django.db import migrations


def forward(apps, schema_editor):
    LicenseType = apps.get_model("licenses", "LicenseType")
    LicenseTypeField = apps.get_model("licenses", "LicenseTypeField")
    License = apps.get_model("licenses", "License")
    LicenseCustomField = apps.get_model("licenses", "LicenseCustomField")

    # 1 + 2: вид и ключевой реквизит.
    for lt in LicenseType.objects.all():
        lt.kind = "hardware" if lt.name == "Аппаратная" else "software"
        lt.is_locked = False
        lt.save(update_fields=["kind", "is_locked"])
        if not lt.fields.filter(is_locked=True).exists():
            key_name = "Номер/ID/Serial токена" if lt.kind == "hardware" else "Номер/ключ"
            LicenseTypeField.objects.create(
                license_type=lt,
                name=key_name,
                value_type="text",
                is_required=True,
                is_locked=True,
            )

    # 3: перенос прежних наименований в доп. поле.
    for lic in License.objects.exclude(name="").exclude(name__isnull=True):
        LicenseCustomField.objects.get_or_create(
            license=lic,
            name="Прежнее наименование",
            defaults={"value": lic.name},
        )

    # 4: удаление пустых прежних базовых типов.
    for base_name in ("Программная", "Аппаратная"):
        for lt in LicenseType.objects.filter(name=base_name):
            if not lt.licenses.exists():
                lt.fields.all().delete()
                lt.delete()


def backward(apps, schema_editor):
    # Необратимо: не восстанавливаем удалённые типы и не удаляем перенесённые
    # доп. поля (данные важнее чистого отката).
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("licenses", "0010_licensetype_kind_license_name_optional"),
    ]

    operations = [
        migrations.RunPython(forward, backward),
    ]
