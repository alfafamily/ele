"""Сборка данных отчётов B45 (плоские dict'ы для JSON).

Отчёты — только чтение, доступ Администратор/Ответственный за учёт. Строим
компактные структуры «дерево мест / список сотрудников» с вложенным
закреплённым имуществом. Ключевой инвариант размещения (B8): свободный остаток
лежит на складе (place_type=storage); стационарно закреплённое — на рабочем
месте или МОП (place_type in workplace/common); мобильное — за сотрудником.
"""

from employees.models import AccessPass, SimCard
from equipment.models import Equipment
from licenses.models import License
from locations.models import Building, Place
from tools.models import ToolAllocation
from transport.models import Transport


# --- Компактные представления объектов -------------------------------------

def _eq_label(eq):
    """«Тип + Модель» оборудования (Модель — залоченный реквизит типа)."""
    model_value = next(
        (fv.value_text for fv in eq.field_values.all()
         if fv.field.is_locked and fv.field.name == "Модель"),
        None,
    )
    return f"{eq.equipment_type.name} {model_value}" if model_value else eq.equipment_type.name


def _sim_item(s):
    return {
        "id": s.id,
        "phone_number": s.phone_number,
        "sim_type": s.get_sim_type_display(),
        "operator": s.network_operator,
    }


def _license_item(lic):
    return {
        "id": lic.id,
        "license_type_name": lic.license_type.name,
        "kind": lic.license_type.kind,
    }


def _equipment_item(eq):
    """Оборудование с вложенными SIM и лицензиями (они «в оборудовании»)."""
    return {
        "id": eq.id,
        "inventory_number": eq.inventory_number,
        "type_and_model": _eq_label(eq),
        "sim": [_sim_item(s) for s in eq.sim_cards.all() if not s.is_utilized],
        "licenses": [_license_item(lic) for lic in eq.licenses.all() if not lic.is_retired],
    }


def _tool_item(alloc):
    return {"id": alloc.tool_id, "name": alloc.tool.name, "quantity": alloc.quantity}


def _employee_item(emp):
    return {"id": emp.id, "name": f"{emp.last_name} {emp.first_name}".strip(), "position": emp.position}


def _transport_item(t):
    model_value = next(
        (fv.value_text for fv in t.field_values.all()
         if fv.field.is_locked and fv.field.name == "Модель"),
        None,
    )
    plate = next(
        (fv.value_text for fv in t.field_values.all()
         if fv.field.is_locked and fv.field.name == "Гос.номер"),
        None,
    )
    label = f"{t.transport_type.name} {model_value}" if model_value else t.transport_type.name
    return {"id": t.id, "inventory_number": t.inventory_number, "type_and_model": label, "plate": plate}


# --- Prefetch-хелперы -------------------------------------------------------

_EQ_PREFETCH = ("field_values__field", "sim_cards", "licenses__license_type")


def _equipment_at_places(place_ids):
    """{place_id: [equipment_item, ...]} — оборудование, стоящее на местах."""
    qs = (
        Equipment.objects.filter(place_id__in=place_ids, is_written_off=False)
        .select_related("equipment_type")
        .prefetch_related(*_EQ_PREFETCH)
    )
    out = {}
    for eq in qs:
        out.setdefault(eq.place_id, []).append(_equipment_item(eq))
    return out


def _tools_at_places(place_ids):
    """{place_id: [tool_item, ...]} — размещения инструмента на местах."""
    qs = (
        ToolAllocation.objects.filter(place_id__in=place_ids, tool__is_written_off=False)
        .select_related("tool")
    )
    out = {}
    for alloc in qs:
        out.setdefault(alloc.place_id, []).append(_tool_item(alloc))
    return out


# --- Отчёт по местам (рабочие / МОП / хранение) ----------------------------

def build_places_report(kind, *, building_id=None, room_id=None, place_id=None):
    """Дерево Здание → Помещение → Место (место заданного типа) с вложенным
    имуществом. Пустые места включаются. kind ∈ {workplace, common, storage}."""
    places = Place.objects.filter(place_type=kind, is_archived=False).select_related(
        "room__building"
    )
    if place_id:
        places = places.filter(id=place_id)
    if room_id:
        places = places.filter(room_id=room_id)
    if building_id:
        places = places.filter(room__building_id=building_id)

    place_list = list(places)
    place_ids = [p.id for p in place_list]
    eq_map = _equipment_at_places(place_ids)
    tool_map = _tools_at_places(place_ids)

    # Сотрудники за рабочими местами (только для kind=workplace).
    emp_map = {}
    if kind == Place.PlaceType.WORKPLACE:
        for p in Place.objects.filter(id__in=place_ids).prefetch_related("employees"):
            emp_map[p.id] = [_employee_item(e) for e in p.employees.all()]

    return _group_by_building(place_list, eq_map, tool_map, emp_map, kind == Place.PlaceType.WORKPLACE)


def _group_by_building(place_list, eq_map, tool_map, emp_map, with_employees):
    """Группировка плоского списка мест в дерево здание → помещение → место."""
    buildings = {}
    for p in sorted(place_list, key=lambda x: (x.name or "").lower()):
        b = p.room.building
        b_node = buildings.setdefault(
            b.id, {"id": b.id, "name": b.name, "_rooms": {}},
        )
        r_node = b_node["_rooms"].setdefault(
            p.room_id, {"id": p.room_id, "name": p.room.name, "floor": p.room.floor, "places": []},
        )
        place_data = {
            "id": p.id,
            "name": p.name,
            "equipment": eq_map.get(p.id, []),
            "tools": tool_map.get(p.id, []),
        }
        if with_employees:
            place_data["employees"] = emp_map.get(p.id, [])
        r_node["places"].append(place_data)

    result = []
    for b in sorted(buildings.values(), key=lambda x: (x["name"] or "").lower()):
        rooms = sorted(b["_rooms"].values(), key=lambda r: (r["name"] or "").lower())
        result.append({"id": b["id"], "name": b["name"], "rooms": rooms})
    return result


# --- Отчёт по парковкам -----------------------------------------------------

def build_parking_report(*, building_id=None, room_id=None, place_id=None):
    """Парковочные места с увязкой к зданию/помещению; за каждым — сотрудник
    (личное авто) или транспорт компании. Пустые места включаются."""
    places = (
        Place.objects.filter(place_type=Place.PlaceType.PARKING_SPOT, is_archived=False)
        .select_related("room__building")
        .prefetch_related("employees", "transport__transport_type", "transport__field_values__field")
    )
    if place_id:
        places = places.filter(id=place_id)
    if room_id:
        places = places.filter(room_id=room_id)
    if building_id:
        places = places.filter(room__building_id=building_id)

    buildings = {}
    for p in sorted(places, key=lambda x: (x.name or "").lower()):
        b = p.room.building
        b_node = buildings.setdefault(b.id, {"id": b.id, "name": b.name, "_rooms": {}})
        r_node = b_node["_rooms"].setdefault(
            p.room_id, {"id": p.room_id, "name": p.room.name, "floor": p.room.floor, "places": []},
        )
        r_node["places"].append({
            "id": p.id,
            "name": p.name,
            "employees": [_employee_item(e) for e in p.employees.all()],
            "transport": [_transport_item(t) for t in p.transport.all()],
        })

    result = []
    for b in sorted(buildings.values(), key=lambda x: (x["name"] or "").lower()):
        rooms = sorted(b["_rooms"].values(), key=lambda r: (r["name"] or "").lower())
        result.append({"id": b["id"], "name": b["name"], "rooms": rooms})
    return result


# --- Отчёт по имуществу у сотрудников ---------------------------------------

def build_employees_report(*, employee_id=None):
    """Список сотрудников: закреплённое имущество (оборудование+SIM/лицензии,
    инструменты, SIM за сотрудником, пропуска/ключи, транспорт) + рабочие места
    сотрудника с имуществом, стоящим на них."""
    from employees.models import Employee

    employees = Employee.objects.all().order_by("last_name", "first_name")
    if employee_id:
        employees = employees.filter(id=employee_id)
    emp_list = list(employees)
    emp_ids = [e.id for e in emp_list]

    # Оборудование за сотрудниками.
    eq_by_emp = {}
    for eq in (
        Equipment.objects.filter(employee_id__in=emp_ids, is_written_off=False)
        .select_related("equipment_type").prefetch_related(*_EQ_PREFETCH)
    ):
        eq_by_emp.setdefault(eq.employee_id, []).append(_equipment_item(eq))

    # Инструменты за сотрудниками.
    tools_by_emp = {}
    for alloc in (
        ToolAllocation.objects.filter(employee_id__in=emp_ids, tool__is_written_off=False)
        .select_related("tool")
    ):
        tools_by_emp.setdefault(alloc.employee_id, []).append(_tool_item(alloc))

    # SIM за сотрудником (напрямую, не в оборудовании).
    sim_by_emp = {}
    for s in SimCard.objects.filter(employee_id__in=emp_ids, is_utilized=False):
        sim_by_emp.setdefault(s.employee_id, []).append(_sim_item(s))

    # Пропуска/ключи за сотрудником.
    pass_by_emp = {}
    for ap in AccessPass.objects.filter(employee_id__in=emp_ids, is_utilized=False):
        pass_by_emp.setdefault(ap.employee_id, []).append({
            "id": ap.id,
            "kind": ap.object_type,
            "kind_display": ap.get_object_type_display(),
            "account_number": ap.account_number,
        })

    # Транспорт за сотрудником.
    tr_by_emp = {}
    for t in (
        Transport.objects.filter(employee_id__in=emp_ids, is_written_off=False)
        .select_related("transport_type").prefetch_related("field_values__field")
    ):
        tr_by_emp.setdefault(t.employee_id, []).append(_transport_item(t))

    # Рабочие места сотрудников (place_type=workplace, где сотрудник закреплён) +
    # имущество на них.
    wp_qs = (
        Place.objects.filter(
            place_type=Place.PlaceType.WORKPLACE, is_archived=False, employees__id__in=emp_ids,
        )
        .select_related("room__building")
        .prefetch_related("employees")
    )
    wp_list = list(wp_qs)
    wp_ids = [p.id for p in wp_list]
    wp_eq = _equipment_at_places(wp_ids)
    wp_tools = _tools_at_places(wp_ids)
    wp_by_emp = {}
    for p in wp_list:
        node = {
            "id": p.id,
            "name": p.name,
            "building_name": p.room.building.name,
            "room_name": p.room.name,
            "equipment": wp_eq.get(p.id, []),
            "tools": wp_tools.get(p.id, []),
        }
        for e in p.employees.all():
            if e.id in emp_ids:
                wp_by_emp.setdefault(e.id, []).append(node)

    result = []
    for e in emp_list:
        result.append({
            "id": e.id,
            "name": f"{e.last_name} {e.first_name}".strip(),
            "position": e.position,
            "department": e.department,
            "equipment": eq_by_emp.get(e.id, []),
            "tools": tools_by_emp.get(e.id, []),
            "sim": sim_by_emp.get(e.id, []),
            "passes": pass_by_emp.get(e.id, []),
            "transport": tr_by_emp.get(e.id, []),
            "workplaces": wp_by_emp.get(e.id, []),
        })
    return result
