"""Авторизация инлайн-выдачи файла (B39/F1).

`/api/files/<pk>/inline/` раньше отдавал ЛЮБОЙ StoredFile любому
аутентифицированному пользователю по последовательному id — классический IDOR
(перебором id читались чужие сканы лицензий, аватары, планы помещений, файлы
реквизитов). Здесь — проверка «вправе ли пользователь увидеть этот файл»:
доступ выводится из объекта, который на файл ссылается, и повторяет матрицу
видимости этого объекта (см. core/permissions.py).

Fail-closed: файл, происхождение которого мы не смогли сопоставить с
разрешённым объектом (осиротевший, либо привязанный к разделу, недоступному
роли), не отдаётся.
"""


def _role(user):
    return getattr(user, "role", None)


def can_access_stored_file(user, sf) -> bool:
    """Может ли `user` получить содержимое StoredFile `sf` через инлайн-прокси."""
    if not (user and user.is_authenticated):
        return False

    # Бинарники бэкапов инлайн не превьюятся никогда (скачиваются отдельным
    # авторизованным эндпоинтом в Настройках). Явно закрываем, чтобы
    # зашифрованный дамп нельзя было стянуть по id.
    from backup.export import BACKUP_SUBDIR
    if sf.path and sf.path.startswith(f"{BACKUP_SUBDIR}/"):
        return False

    from company.models import Company

    # Лого компании показывается в шапке и письмах — доступно всем в компании.
    if Company.objects.filter(logo_id=sf.pk).exists():
        return True

    role = _role(user)
    # admin/accountant — полный доступ ко всем бизнес-объектам компании.
    if role in ("admin", "accountant"):
        return True
    # Наблюдатель (employee + is_observer) — сквозной read-only ко всем
    # бизнес-разделам, значит и ко всем их файлам.
    if role == "employee" and getattr(user, "is_observer", False):
        return True

    emp_id = getattr(user, "employee_id", None)

    # Аватар сотрудника — только свой (для остальных ролей закрыт).
    from employees.models import Employee
    avatar_emp_id = Employee.objects.filter(avatar_id=sf.pk).values_list("id", flat=True).first()
    if avatar_emp_id is not None:
        return role == "employee" and emp_id is not None and avatar_emp_id == emp_id

    # Файлы реквизитов Оборудования: «Ответственный за ТО» видит весь раздел
    # на чтение; обычный «Сотрудник» — только своё закреплённое оборудование.
    from equipment.models import Equipment, EquipmentFieldFile, EquipmentFieldValue
    eq_ids = set(
        EquipmentFieldValue.objects.filter(value_file_id=sf.pk).values_list("equipment_id", flat=True)
    ) | set(
        EquipmentFieldFile.objects.filter(stored_file_id=sf.pk).values_list("field_value__equipment_id", flat=True)
    )
    if eq_ids:
        if role == "maintenance":
            return True
        return (
            role == "employee"
            and emp_id is not None
            and Equipment.objects.filter(pk__in=eq_ids, employee_id=emp_id).exists()
        )

    # Файлы реквизитов Транспорта: «Автомеханик» видит весь раздел на чтение;
    # обычный «Сотрудник» — только свой закреплённый транспорт.
    from transport.models import Transport, TransportFieldFile, TransportFieldValue
    tr_ids = set(
        TransportFieldValue.objects.filter(value_file_id=sf.pk).values_list("transport_id", flat=True)
    ) | set(
        TransportFieldFile.objects.filter(stored_file_id=sf.pk).values_list("field_value__transport_id", flat=True)
    )
    if tr_ids:
        if role == "automechanic":
            return True
        return (
            role == "employee"
            and emp_id is not None
            and Transport.objects.filter(pk__in=tr_ids, employee_id=emp_id).exists()
        )

    # Планы помещений/парковок (Room.plan_file). Показываются в Профиле сотрудника
    # для его парковочных мест (личное авто) и на карточке его транспорта, поэтому
    # обычный «Сотрудник» вправе открыть план комнаты, где он размещён (парковочное/
    # рабочее место) или где стоит закреплённый за ним транспорт; «Автомеханик»
    # читает раздел «Транспорт» целиком — значит и планы парковок, где стоит любой
    # транспорт компании.
    from locations.models import Place, Room
    plan_room_ids = set(Room.objects.filter(plan_file_id=sf.pk).values_list("id", flat=True))
    if plan_room_ids:
        if emp_id is not None and (
            Place.objects.filter(room_id__in=plan_room_ids, employees__id=emp_id).exists()
            or Place.objects.filter(room_id__in=plan_room_ids, transport__employee_id=emp_id).exists()
        ):
            return True
        if role == "automechanic" and Place.objects.filter(
            room_id__in=plan_room_ids, transport__isnull=False
        ).exists():
            return True
        return False

    # Лицензии и прочее видят только admin/accountant/Наблюдатель (обработаны
    # выше). Для остальных ролей и для файлов, которые мы не смогли сопоставить ни
    # с одним объектом, — отказ (fail-closed).
    return False
