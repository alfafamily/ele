from datetime import timedelta

from accounts.models import User
from django.utils import timezone
from employees.models import Employee
from rest_framework.test import APITestCase

from .models import MaintenanceRecord, Transport, TransportType


def _base_fields(resp_data):
    """{name: field_id} по базовым (залоченным) реквизитам типа из ответа."""
    return {f["name"]: f["id"] for f in resp_data["fields"] if f["is_locked"]}


class TransportTypeTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=self.admin)

    def test_gibdd_type_seeds_model_and_plate(self):
        resp = self.client.post(
            "/api/transport-types/",
            {"name": "Легковой", "mileage_unit": "km", "gibdd_registration": True},
            format="json",
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        base = _base_fields(resp.data)
        self.assertIn("Модель", base)
        self.assertIn("Гос.номер", base)

    def test_non_gibdd_type_has_only_model(self):
        resp = self.client.post(
            "/api/transport-types/",
            {"name": "Погрузчик", "mileage_unit": "motohours", "gibdd_registration": False},
            format="json",
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        base = _base_fields(resp.data)
        self.assertIn("Модель", base)
        self.assertNotIn("Гос.номер", base)

    def test_gibdd_flag_immutable(self):
        resp = self.client.post(
            "/api/transport-types/",
            {"name": "Легковой", "gibdd_registration": True},
            format="json",
        )
        type_id = resp.data["id"]
        resp = self.client.patch(
            f"/api/transport-types/{type_id}/", {"gibdd_registration": False}, format="json"
        )
        self.assertEqual(resp.status_code, 400, resp.data)

    def test_locked_base_field_cannot_be_renamed_or_deleted(self):
        resp = self.client.post(
            "/api/transport-types/", {"name": "Легковой", "gibdd_registration": True}, format="json"
        )
        type_id = resp.data["id"]
        plate_id = _base_fields(resp.data)["Гос.номер"]
        r = self.client.patch(
            f"/api/transport-types/{type_id}/fields/{plate_id}/", {"name": "VIN"}, format="json"
        )
        self.assertEqual(r.status_code, 400, r.data)
        r = self.client.delete(f"/api/transport-types/{type_id}/fields/{plate_id}/")
        self.assertEqual(r.status_code, 409, getattr(r, "data", r))


class TransportCrudTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(
            "/api/transport-types/", {"name": "Легковой", "gibdd_registration": True}, format="json"
        )
        self.type_id = resp.data["id"]
        self.base = _base_fields(resp.data)

    def _create(self, inv="TS-1", model="Camry", plate="А001АА777"):
        return self.client.post(
            "/api/transport/",
            {
                "inventory_number": inv,
                "transport_type": self.type_id,
                "field_values_input": [
                    {"field": self.base["Модель"], "value": model},
                    {"field": self.base["Гос.номер"], "value": plate},
                ],
            },
            format="json",
        )

    def test_create_and_type_and_model(self):
        resp = self._create()
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data["type_and_model"], "Легковой Camry")
        self.assertEqual(resp.data["plate"], "А001АА777")

    def test_inventory_number_unique(self):
        self.assertEqual(self._create(inv="TS-1", plate="А001АА777").status_code, 201)
        resp = self._create(inv="TS-1", plate="В002ВВ777")
        self.assertEqual(resp.status_code, 400, resp.data)

    def test_plate_unique_case_insensitive(self):
        self.assertEqual(self._create(inv="TS-1", plate="А001АА777").status_code, 201)
        resp = self._create(inv="TS-2", plate="а001аа777")
        self.assertEqual(resp.status_code, 400, resp.data)

    def test_assign_unassign_write_off(self):
        transport_id = self._create().data["id"]
        emp = Employee.objects.create(last_name="Иванов", first_name="Иван")
        r = self.client.post(f"/api/transport/{transport_id}/assign/", {"employee": emp.id}, format="json")
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data["status"], "assigned")
        r = self.client.post(f"/api/transport/{transport_id}/unassign/", {}, format="json")
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data["status"], "free")
        r = self.client.post(f"/api/transport/{transport_id}/write-off/", {"comment": "утиль"}, format="json")
        self.assertEqual(r.status_code, 200, r.data)
        self.assertTrue(Transport.objects.get(pk=transport_id).is_written_off)

    def test_delete_forbidden(self):
        transport_id = self._create().data["id"]
        r = self.client.delete(f"/api/transport/{transport_id}/")
        self.assertEqual(r.status_code, 405)


class TransportParkingTests(APITestCase):
    def setUp(self):
        from locations.models import Building, Place, Room

        self.admin = User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=self.admin)
        ttype = TransportType.objects.create(name="Легковой")
        self.car = Transport.objects.create(inventory_number="TS-1", transport_type=ttype)
        self.car2 = Transport.objects.create(inventory_number="TS-2", transport_type=ttype)
        b = Building.objects.create(name="БЦ")
        parking = Room.objects.create(building=b, name="Паркинг", parking_type="adjacent")
        self.spot = Place.objects.create(room=parking, name="A-1", place_type="parking_spot")
        self.spot2 = Place.objects.create(room=parking, name="A-2", place_type="parking_spot")
        # Место с личным авто — для транспорта компании недоступно.
        emp = Employee.objects.create(last_name="Иванов", first_name="Иван")
        self.personal_spot = Place.objects.create(room=parking, name="P-1", place_type="parking_spot")
        self.personal_spot.employees.add(emp)

    def test_assign_spot_and_output(self):
        r = self.client.post(f"/api/transport/{self.car.id}/parking/", {"mode": "spot", "place": self.spot.id}, format="json")
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data["parking"]["kind"], "spot")
        self.assertEqual(r.data["parking"]["place"], self.spot.id)

    def test_one_spot_per_transport(self):
        self.spot.transport.add(self.car)
        # Через premises: закрепить тот же транспорт за другим местом нельзя.
        r = self.client.patch(f"/api/places/{self.spot2.id}/", {"transport": [self.car.id]}, format="json")
        self.assertEqual(r.status_code, 400, r.data)
        # Через карточку транспорта: закрепление за spot2 снимает со spot.
        r = self.client.post(f"/api/transport/{self.car.id}/parking/", {"mode": "spot", "place": self.spot2.id}, format="json")
        self.assertEqual(r.status_code, 200, r.data)
        self.assertFalse(self.spot.transport.filter(pk=self.car.id).exists())
        self.assertTrue(self.spot2.transport.filter(pk=self.car.id).exists())

    def test_cannot_assign_to_personal_spot(self):
        r = self.client.post(f"/api/transport/{self.car.id}/parking/", {"mode": "spot", "place": self.personal_spot.id}, format="json")
        self.assertEqual(r.status_code, 400, r.data)

    def test_driver_address_requires_employee(self):
        # Без сотрудника «на адресе сотрудника» недоступно.
        r = self.client.post(f"/api/transport/{self.car.id}/parking/", {"mode": "driver_address"}, format="json")
        self.assertEqual(r.status_code, 400, r.data)

    def test_driver_address_and_none(self):
        emp = Employee.objects.create(last_name="Петров", first_name="Пётр")
        self.car.employee = emp
        self.car.save()
        r = self.client.post(f"/api/transport/{self.car.id}/parking/", {"mode": "driver_address"}, format="json")
        self.assertEqual(r.data["parking"]["kind"], "driver_address")
        r = self.client.post(f"/api/transport/{self.car.id}/parking/", {"mode": "none"}, format="json")
        self.assertIsNone(r.data["parking"])

    def test_unassign_clears_driver_address(self):
        emp = Employee.objects.create(last_name="Петров", first_name="Пётр")
        self.car.employee = emp
        self.car.save()
        self.client.post(f"/api/transport/{self.car.id}/parking/", {"mode": "driver_address"}, format="json")
        r = self.client.post(f"/api/transport/{self.car.id}/unassign/", {}, format="json")
        self.assertEqual(r.status_code, 200, r.data)
        self.assertIsNone(r.data["parking"])
        self.car.refresh_from_db()
        self.assertFalse(self.car.parks_at_driver_address)

    def test_unassign_keeps_spot(self):
        # Открепление сотрудника не снимает закрепление за парковочным местом.
        emp = Employee.objects.create(last_name="Сидоров", first_name="Сидор")
        self.car.employee = emp
        self.car.save()
        self.spot.transport.add(self.car)
        r = self.client.post(f"/api/transport/{self.car.id}/unassign/", {}, format="json")
        self.assertEqual(r.data["parking"]["kind"], "spot")

    def test_picker_excludes_assigned(self):
        self.spot.transport.add(self.car)
        r = self.client.get("/api/transport/picker/")
        ids = [t["id"] for t in r.data]
        self.assertNotIn(self.car.id, ids)
        self.assertIn(self.car2.id, ids)
        # С ?place — транспорт этого места остаётся (для редактирования).
        r = self.client.get(f"/api/transport/picker/?place={self.spot.id}")
        self.assertIn(self.car.id, [t["id"] for t in r.data])


class TransportMaintenanceTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(
            "/api/transport-types/", {"name": "Легковой", "mileage_unit": "km", "gibdd_registration": True}, format="json"
        )
        self.type_id = resp.data["id"]
        base = _base_fields(resp.data)
        self.transport_id = self.client.post(
            "/api/transport/",
            {
                "inventory_number": "TS-1",
                "transport_type": self.type_id,
                "field_values_input": [
                    {"field": base["Модель"], "value": "Camry"},
                    {"field": base["Гос.номер"], "value": "А001АА777"},
                ],
            },
            format="json",
        ).data["id"]

    def test_type_regulation_creates_plan_and_perform_with_mileage(self):
        r = self.client.post(
            f"/api/transport-types/{self.type_id}/regulations/",
            {"name": "ТО-1", "period_months": 6, "items": [{"kind": "work", "name": "Замена масла", "quantity": "1"}]},
            format="json",
        )
        self.assertEqual(r.status_code, 201, r.data)
        reg_id = r.data["id"]

        # План появился у экземпляра.
        rows = self.client.get(f"/api/transport/{self.transport_id}/regulations/").data
        self.assertTrue(any(row["id"] == reg_id for row in rows))

        next_date = (timezone.localdate() + timedelta(days=180)).isoformat()
        r = self.client.post(
            f"/api/transport/{self.transport_id}/maintenance/",
            {
                "regulation": reg_id,
                "next_planned_date": next_date,
                "mileage": "45000",
                "items": [{"kind": "work", "name": "Замена масла", "quantity": "1", "from_regulation": True}],
            },
            format="json",
        )
        self.assertEqual(r.status_code, 200, r.data)
        rec = MaintenanceRecord.objects.get(transport_id=self.transport_id)
        self.assertEqual(str(rec.mileage), "45000.00")
        # last_mileage на карточке.
        self.assertEqual(r.data["last_mileage"]["unit"], "km")
        self.assertEqual(str(r.data["last_mileage"]["value"]), "45000.00")

    def test_mileage_must_increase(self):
        # Первое ТО с пробегом 45000.
        r = self.client.post(
            f"/api/transport/{self.transport_id}/maintenance/",
            {"mileage": "45000", "items": [{"kind": "work", "name": "Мойка", "quantity": "1"}]},
            format="json",
        )
        self.assertEqual(r.status_code, 200, r.data)
        # Меньший/равный пробег — отклонить.
        for bad in ("40000", "45000"):
            r = self.client.post(
                f"/api/transport/{self.transport_id}/maintenance/",
                {"mileage": bad, "items": [{"kind": "work", "name": "Мойка", "quantity": "1"}]},
                format="json",
            )
            self.assertEqual(r.status_code, 400, f"{bad}: {getattr(r, 'data', r)}")
        # Больший — принять.
        r = self.client.post(
            f"/api/transport/{self.transport_id}/maintenance/",
            {"mileage": "46000", "items": [{"kind": "work", "name": "Мойка", "quantity": "1"}]},
            format="json",
        )
        self.assertEqual(r.status_code, 200, r.data)

    def test_perform_without_mileage_ok(self):
        r = self.client.post(
            f"/api/transport/{self.transport_id}/maintenance/",
            {"items": [{"kind": "work", "name": "Мойка", "quantity": "1"}]},
            format="json",
        )
        self.assertEqual(r.status_code, 200, r.data)
        self.assertIsNone(r.data["last_mileage"])

    def test_individual_regulation(self):
        r = self.client.post(
            f"/api/transport/{self.transport_id}/regulations/",
            {"name": "Индивидуальный", "on_demand": True, "items": [{"kind": "material", "name": "Фильтр", "quantity": "2"}]},
            format="json",
        )
        self.assertEqual(r.status_code, 201, r.data)
        self.assertTrue(any(row["scope"] == "individual" for row in r.data))


class TransportPermissionTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")
        # Тип и объект создаём под админом.
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(
            "/api/transport-types/", {"name": "Легковой", "gibdd_registration": True}, format="json"
        )
        self.type_id = resp.data["id"]
        base = _base_fields(resp.data)
        self.transport_id = self.client.post(
            "/api/transport/",
            {
                "inventory_number": "TS-1",
                "transport_type": self.type_id,
                "field_values_input": [
                    {"field": base["Модель"], "value": "Camry"},
                    {"field": base["Гос.номер"], "value": "А001АА777"},
                ],
            },
            format="json",
        ).data["id"]
        # Регламент типа — чтобы автомеханик мог провести по нему ТО.
        self.reg_id = self.client.post(
            f"/api/transport-types/{self.type_id}/regulations/",
            {"name": "ТО-1", "period_months": 6, "items": [{"kind": "work", "name": "Осмотр", "quantity": "1"}]},
            format="json",
        ).data["id"]

    def test_automechanic_read_only_can_perform_cannot_crud(self):
        mech = User.objects.create_user(email="mech@example.com", password="Str0ng!Pass1", role=User.Role.AUTOMECHANIC)
        self.client.force_authenticate(user=mech)

        # Читает список и карточку.
        self.assertEqual(self.client.get("/api/transport/").status_code, 200)
        self.assertEqual(self.client.get(f"/api/transport/{self.transport_id}/").status_code, 200)

        # Не может создавать объекты.
        r = self.client.post(
            "/api/transport/", {"inventory_number": "TS-9", "transport_type": self.type_id}, format="json"
        )
        self.assertIn(r.status_code, (403, 405))

        # Не имеет доступа к типам.
        self.assertEqual(self.client.get("/api/transport-types/").status_code, 403)

        # Может провести ТО.
        next_date = (timezone.localdate() + timedelta(days=180)).isoformat()
        r = self.client.post(
            f"/api/transport/{self.transport_id}/maintenance/",
            {"regulation": self.reg_id, "next_planned_date": next_date,
             "items": [{"kind": "work", "name": "Осмотр", "quantity": "1", "from_regulation": True}]},
            format="json",
        )
        self.assertEqual(r.status_code, 200, r.data)

    def test_automechanic_type_scope_limits_visibility_and_perform(self):
        # Второй тип + объект, недоступный автомеханику по области типов.
        self.client.force_authenticate(user=self.admin)
        resp2 = self.client.post(
            "/api/transport-types/", {"name": "Грузовой", "gibdd_registration": True}, format="json"
        )
        type2 = resp2.data["id"]
        base2 = _base_fields(resp2.data)
        t2 = self.client.post(
            "/api/transport/",
            {"inventory_number": "TS-2", "transport_type": type2,
             "field_values_input": [{"field": base2["Модель"], "value": "Gazelle"}, {"field": base2["Гос.номер"], "value": "В002ВВ777"}]},
            format="json",
        ).data["id"]

        mech = User.objects.create_user(email="mech2@example.com", password="Str0ng!Pass1", role=User.Role.AUTOMECHANIC)
        mech.maintenance_all_transport_types = False
        mech.save()
        mech.maintenance_transport_types.set([self.type_id])  # только первый тип
        self.client.force_authenticate(user=mech)

        # В списке только транспорт своей области типов.
        ids = [row["id"] for row in self.client.get("/api/transport/").data["results"]]
        self.assertIn(self.transport_id, ids)
        self.assertNotIn(t2, ids)

        # ТО по объекту вне области — 403 (объект не виден → 404/403).
        r = self.client.post(
            f"/api/transport/{t2}/maintenance/",
            {"items": [{"kind": "work", "name": "x", "quantity": "1"}]},
            format="json",
        )
        self.assertIn(r.status_code, (403, 404))

    def test_employee_sees_only_own_transport(self):
        emp = Employee.objects.create(last_name="Иванов", first_name="Иван")
        # Закрепляем существующий транспорт за сотрудником.
        self.client.force_authenticate(user=self.admin)
        self.client.post(f"/api/transport/{self.transport_id}/assign/", {"employee": emp.id}, format="json")
        # Обычный сотрудник, связанный с этой карточкой.
        user = User.objects.create_user(email="ivan@example.com", password="Str0ng!Pass1", role=User.Role.EMPLOYEE)
        user.employee = emp
        user.save()
        self.client.force_authenticate(user=user)
        ids = [row["id"] for row in self.client.get("/api/transport/").data["results"]]
        self.assertEqual(ids, [self.transport_id])
        # Свой объект открывается, чужой — нет.
        self.assertEqual(self.client.get(f"/api/transport/{self.transport_id}/").status_code, 200)
        # Создавать/проводить ТО обычный сотрудник не может.
        self.assertIn(
            self.client.post("/api/transport/", {"inventory_number": "TS-X", "transport_type": self.type_id}, format="json").status_code,
            (403, 405),
        )

    def test_accountant_transport_flags_required_for_perform(self):
        acc = User.objects.create_user(email="acc@example.com", password="Str0ng!Pass1", role=User.Role.ACCOUNTANT)
        self.client.force_authenticate(user=acc)
        # Без флага can_maintain_transport — провести ТО нельзя.
        r = self.client.post(
            f"/api/transport/{self.transport_id}/maintenance/",
            {"items": [{"kind": "work", "name": "x", "quantity": "1"}]},
            format="json",
        )
        self.assertEqual(r.status_code, 403, getattr(r, "data", r))
        # С флагом — можно.
        acc.can_maintain_transport = True
        acc.save()
        r = self.client.post(
            f"/api/transport/{self.transport_id}/maintenance/",
            {"items": [{"kind": "work", "name": "x", "quantity": "1"}]},
            format="json",
        )
        self.assertEqual(r.status_code, 200, r.data)


class TransportNumberingTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(user=self.admin)

    def test_next_number_burns(self):
        r1 = self.client.post("/api/company/next-number/", {"kind": "transport"}, format="json")
        self.assertEqual(r1.status_code, 200, r1.data)
        r2 = self.client.post("/api/company/next-number/", {"kind": "transport"}, format="json")
        self.assertNotEqual(r1.data["number"], r2.data["number"])
        self.assertTrue(r1.data["number"].startswith("TS-"))
