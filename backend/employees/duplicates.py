"""B12 — объединение сотрудников-дубликатов.

Дубли определяются только по Фамилии и Имени (отчества в модели нет) и только
среди РАБОТАЮЩИХ сотрудников (is_employed=True). Учётка сотрудника — обратная
связь OneToOne User.employee (related_name="user").

Ключевой инвариант: во всех сценариях объединения удаляются только сотрудники
БЕЗ учётки. Связанные с пользователем сотрудники никогда не удаляются, поэтому
User.employee при слиянии переносить не нужно и конфликт OneToOne невозможен.
"""

from django.db import transaction

from .models import Employee


def _norm(s):
    """Нормализация части имени для сопоставления: без крайних/повторных
    пробелов, регистронезависимо."""
    return " ".join((s or "").split()).casefold()


def name_key(employee):
    return (_norm(employee.last_name), _norm(employee.first_name))


def has_user(employee):
    """Есть ли у сотрудника учётная запись (OneToOne User.employee)."""
    return hasattr(employee, "user")


def matching_working_employees(last_name, first_name, exclude_id=None):
    """Работающие сотрудники с теми же (нормализованными) Фамилией и Именем.

    Регистр/лишние пробелы игнорируются, поэтому фильтруем по __iexact на
    подчищенном вводе, а окончательное сравнение — в Python по name_key (на
    случай двойных пробелов внутри значения в БД)."""
    last = " ".join((last_name or "").split())
    first = " ".join((first_name or "").split())
    if not last or not first:
        return []
    qs = (
        Employee.objects.filter(is_employed=True, last_name__iexact=last, first_name__iexact=first)
        .select_related("user")
    )
    if exclude_id is not None:
        qs = qs.exclude(pk=exclude_id)
    target = (_norm(last), _norm(first))
    return [e for e in qs if name_key(e) == target]


def reference_count(employee):
    """Сколько объектов закреплено за сотрудником — для выбора «выжившего» в
    принципе 3 (у кого больше ссылок, тот остаётся)."""
    return (
        employee.equipment.count()
        + employee.sim_cards.count()
        + employee.passes.count()
        + employee.tool_allocations.count()
        + employee.workplaces.count()
    )


# ---------------------------------------------------------------------------
# Контроль при создании / регистрации
# ---------------------------------------------------------------------------

def creation_conflicts(last_name, first_name, exclude_id=None):
    """Тёзки-работники для предупреждения при создании сотрудника (invite /
    раздел «Сотрудники»). Для связанных с учёткой добавляем логин (email)."""
    return [
        {
            "id": e.id,
            "full_name": str(e),
            "user_email": e.user.email if has_user(e) else None,
        }
        for e in matching_working_employees(last_name, first_name, exclude_id=exclude_id)
    ]


def conflict_message(conflicts):
    """Текст предупреждения для админа, создающего сотрудника-тёзку."""
    if not conflicts:
        return ""
    linked = [c for c in conflicts if c["user_email"]]
    parts = ["В системе уже есть сотрудник с такими Фамилией и Именем"]
    if linked:
        logins = ", ".join(c["user_email"] for c in linked)
        parts.append(f" (учётная запись: {logins})")
    parts.append(". Всё равно создать нового?")
    return "".join(parts)


# Сообщения самостоятельной регистрации / входа через Яндекс ID (тексты из ТЗ).
REGISTER_EXISTS_MESSAGE = (
    "Сотрудник с такими Фамилией и Именем уже существует в системе. Возможно, вы "
    "уже создавали аккаунт ранее. Попробуйте восстановить пароль от вашего "
    "аккаунта. Если вы не создавали аккаунт ранее, обратитесь к вашему "
    "руководителю или системному администратору."
)
REGISTER_AMBIGUOUS_MESSAGE = (
    "В системе зарегистрировано несколько сотрудников с вашими Фамилией и Именем. "
    "Для создания аккаунта обратитесь к вашему руководителю или системному "
    "администратору."
)


def registration_decision(last_name, first_name):
    """Решение при самостоятельной регистрации / входе через Яндекс ID.

    Возвращает (kind, employee):
      • ("create", None)      — тёзок-работников нет, создаём и сотрудника, и учётку;
      • ("link", employee)    — ровно один тёзка БЕЗ учётки: учётку создаём и
                                привязываем к нему (не плодим сотрудника);
      • ("exists", None)      — тёзки есть, но все с учётками (3.i);
      • ("ambiguous", None)   — двое и более тёзок без учётки (3.iii).
    """
    matches = matching_working_employees(last_name, first_name)
    if not matches:
        return ("create", None)
    unlinked = [e for e in matches if not has_user(e)]
    if not unlinked:
        return ("exists", None)
    if len(unlinked) == 1:
        return ("link", unlinked[0])
    return ("ambiguous", None)


# ---------------------------------------------------------------------------
# Детекция возможных дублей (раздел Настроек)
# ---------------------------------------------------------------------------

def group_signature(member_ids):
    """Подпись группы = отсортированные id через запятую. Меняется состав —
    меняется подпись, поэтому пометка «не дубль» перестаёт совпадать и группа
    снова всплывает."""
    return ",".join(str(i) for i in sorted(member_ids))


def _resolution_kind(linked_count):
    if linked_count == 0:
        return "auto_most_refs"   # принцип 3
    if linked_count == 1:
        return "auto_linked"      # принцип 1
    return "map_to_linked"        # принцип 2


def duplicate_groups(include_dismissed=True):
    """Возможные дубли: группы работающих тёзок размера ≥2, где есть хотя бы один
    сотрудник без учётки (если все с учётками — не дубль, правило 1).

    Возвращает список словарей для API. Если include_dismissed=False —
    помеченные «не дубль» группы исключаются (для счётчика-бейджа)."""
    from .models import EmployeeDuplicateDismissal

    working = list(
        Employee.objects.filter(is_employed=True)
        .select_related("user", "avatar")
        .order_by("last_name", "first_name", "id")
    )
    buckets = {}
    for emp in working:
        buckets.setdefault(name_key(emp), []).append(emp)

    dismissed = {d.signature: d for d in EmployeeDuplicateDismissal.objects.all()}
    groups = []
    for members in buckets.values():
        if len(members) < 2:
            continue
        unlinked = [m for m in members if not has_user(m)]
        if not unlinked:
            continue  # правило 1: все с учётками — не дубль
        member_ids = [m.id for m in members]
        sig = group_signature(member_ids)
        is_dismissed = sig in dismissed
        if is_dismissed and not include_dismissed:
            continue
        linked_count = len(members) - len(unlinked)
        groups.append({
            "signature": sig,
            "dismissed": is_dismissed,
            "resolution_kind": _resolution_kind(linked_count),
            "members": [
                {
                    "id": m.id,
                    "full_name": str(m),
                    "first_name": m.first_name,
                    "last_name": m.last_name,
                    "position": m.position,
                    "department": m.department,
                    "has_user": has_user(m),
                    "user_email": m.user.email if has_user(m) else None,
                    "reference_count": reference_count(m),
                }
                for m in members
            ],
        })
    return groups


def active_duplicate_count():
    """Число активных (не помеченных «не дубль») групп — для бейджа."""
    return len(duplicate_groups(include_dismissed=False))


# ---------------------------------------------------------------------------
# Объединение
# ---------------------------------------------------------------------------

def merge_employee(target, source):
    """Перенести ВСЕ ссылки с source на target и удалить source.

    Требования: target != source; source БЕЗ учётки (инвариант B12 — иначе
    потеряли бы учётную запись). Переносятся все объекты, ссылающиеся на
    сотрудника (оборудование, SIM, пропуска/ключи, инструменты и их журнал,
    рабочие места). Атрибуты (должность/отдел/аватар) выжившего НЕ меняются;
    аватар поглощаемого удаляется, чтобы не осиротить файл.
    """
    from storage.service import delete_stored_file
    from tools.models import ToolAllocation, ToolMovement

    if target.id == source.id:
        raise ValueError("Нельзя объединить сотрудника с самим собой.")
    if has_user(source):
        raise ValueError("Поглощаемый сотрудник связан с учётной записью — объединение запрещено.")

    # Оборудование / SIM / пропуска — по одному save(), чтобы сработала история
    # (не bulk .update()).
    for eq in source.equipment.all():
        eq.employee = target
        eq.save(update_fields=["employee"])
    for sim in source.sim_cards.all():
        sim.employee = target
        sim.save(update_fields=["employee"])
    for ap in source.passes.all():
        ap.employee = target
        ap.save(update_fields=["employee"])

    # Инструменты: у ToolAllocation уникальность (tool, employee) и on_delete=PROTECT.
    # Если у target уже есть выдача того же инструмента — складываем количества,
    # иначе просто перепривязываем.
    for alloc in source.tool_allocations.all():
        existing = ToolAllocation.objects.filter(tool_id=alloc.tool_id, employee=target).first()
        if existing:
            existing.quantity += alloc.quantity
            existing.save(update_fields=["quantity"])
            alloc.delete()
        else:
            alloc.employee = target
            alloc.save(update_fields=["employee"])
    # Журнал движений инструментов (SET_NULL) — перецепляем, чтобы история выдач
    # не осиротела при удалении source.
    ToolMovement.objects.filter(employee=source).update(employee=target)

    # Рабочие места (M2M) — по одному, чтобы сработала m2m-история Места.
    for wp in source.workplaces.all():
        wp.employees.add(target)
        wp.employees.remove(source)

    # Аватар поглощаемого не переносим (по решению) — чистим файл.
    if source.avatar_id:
        avatar = source.avatar
        source.avatar = None
        source.save(update_fields=["avatar"])
        delete_stored_file(avatar)

    source.delete()


def plan_resolution(group, mapping=None):
    """По составу группы вернуть список пар (target, source) для слияния.

    group — элемент duplicate_groups(); mapping — {source_id: target_id} (нужен
    только для принципа 2, несколько учёток). Валидирует вход и бросает
    ValueError с понятным текстом.
    """
    members = {m["id"]: m for m in group["members"]}
    linked = [mid for mid, m in members.items() if m["has_user"]]
    unlinked = [mid for mid, m in members.items() if not m["has_user"]]

    pairs = []  # (target_id, source_id)
    if len(linked) == 0:
        # Принцип 3: выживший — у кого больше ссылок (тай-брейк: меньший id).
        survivor = max(unlinked, key=lambda mid: (members[mid]["reference_count"], -mid))
        pairs = [(survivor, s) for s in unlinked if s != survivor]
    elif len(linked) == 1:
        # Принцип 1: все без учётки — в единственного связанного.
        target = linked[0]
        pairs = [(target, s) for s in unlinked]
    else:
        # Принцип 2: явный маппинг каждого несвязанного в одного из связанных.
        mapping = mapping or {}
        norm = {int(k): int(v) for k, v in mapping.items()}
        missing = [s for s in unlinked if s not in norm]
        if missing:
            raise ValueError("Не для всех несвязанных сотрудников выбран, к кому присоединить.")
        for source_id, target_id in norm.items():
            if source_id not in unlinked:
                raise ValueError("Присоединять можно только сотрудников без учётной записи.")
            if target_id not in linked:
                raise ValueError("Присоединять можно только к сотруднику с учётной записью.")
            pairs.append((target_id, source_id))
    return pairs


@transaction.atomic
def resolve_group(signature, mapping=None, current_group=None):
    """Устранить дублирование для группы с подписью signature.

    Пере-валидирует, что группа всё ещё существует в этом составе (иначе
    состояние изменилось параллельно). Выполняет все слияния атомарно, чистит
    устаревшие пометки «не дубль» и возвращает id выжившего(-их)."""
    from .models import EmployeeDuplicateDismissal

    groups = current_group or {g["signature"]: g for g in duplicate_groups()}
    group = groups.get(signature)
    if group is None:
        raise LookupError("Группа изменилась — обновите список возможных дублей.")
    if group["dismissed"]:
        raise ValueError("Строка помечена «не дубль». Сначала снимите отметку.")

    pairs = plan_resolution(group, mapping=mapping)

    # Блокируем участников от гонок и работаем с реальными объектами.
    member_ids = [m["id"] for m in group["members"]]
    # of=("self",): блокируем только строки Employee — reverse OneToOne user даёт
    # LEFT JOIN по nullable-стороне, к которой FOR UPDATE неприменим (Postgres).
    locked = {
        e.id: e
        for e in Employee.objects.select_for_update(of=("self",))
        .select_related("user")
        .filter(pk__in=member_ids)
    }
    if len(locked) != len(member_ids):
        raise LookupError("Группа изменилась — обновите список возможных дублей.")

    survivors = set()
    for target_id, source_id in pairs:
        merge_employee(locked[target_id], locked[source_id])
        survivors.add(target_id)

    # Убираем пометки «не дубль», ссылающиеся на удалённых сотрудников.
    existing_ids = set(Employee.objects.values_list("id", flat=True))
    for d in EmployeeDuplicateDismissal.objects.all():
        if any(mid not in existing_ids for mid in d.member_ids):
            d.delete()

    return sorted(survivors)


def dismiss_group(signature, member_ids, user=None):
    """Пометить группу «не дубль»."""
    from .models import EmployeeDuplicateDismissal

    obj, _ = EmployeeDuplicateDismissal.objects.update_or_create(
        signature=signature,
        defaults={"member_ids": sorted(member_ids), "created_by": user},
    )
    return obj


def undismiss_group(signature):
    """Снять пометку «не дубль» — группа снова считается возможным дублем."""
    from .models import EmployeeDuplicateDismissal

    EmployeeDuplicateDismissal.objects.filter(signature=signature).delete()
