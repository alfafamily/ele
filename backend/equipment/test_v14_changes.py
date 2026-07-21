"""Тесты поведения, добавленного/уточнённого в v1.4 (Оборудование):
списание открепляет сотрудника и скрывает объект из активного списка, карточка
архивного доступна, удаление запрещено; неизменяемость имени доп.поля; удаление
файла реквизита; история фиксирует изменения доп.полей."""
from accounts.models import User
from employees.models import Employee
from rest_framework.test import APITestCase


class WriteOffArchiveTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(self.admin)
        self.type_id = self.client.post("/api/equipment-types/", {"name": "ПК"}, format="json").data["id"]
        self.emp = Employee.objects.create(first_name="Иван", last_name="Иванов")
        self.eq_id = self.client.post(
            "/api/equipment/",
            {"inventory_number": "INV-1", "equipment_type": self.type_id, "employee": self.emp.id},
            format="json",
        ).data["id"]

    def test_write_off_detaches_employee_and_archive_visible(self):
        resp = self.client.post(f"/api/equipment/{self.eq_id}/write-off/", {}, format="json")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertIsNone(resp.data["employee"])
        self.assertTrue(resp.data["is_written_off"])

        # карточка архивного объекта открывается (не 404)
        self.assertEqual(self.client.get(f"/api/equipment/{self.eq_id}/").status_code, 200)
        # в активном списке его нет, в архиве — есть
        active = self.client.get("/api/equipment/?tab=active").data["results"]
        self.assertNotIn(self.eq_id, [x["id"] for x in active])
        archive = self.client.get("/api/equipment/?tab=archive").data["results"]
        self.assertIn(self.eq_id, [x["id"] for x in archive])
        # закрепить сотрудника за списанным нельзя
        resp = self.client.post(f"/api/equipment/{self.eq_id}/assign/", {"employee": self.emp.id}, format="json")
        self.assertEqual(resp.status_code, 409)
        # у сотрудника списанное не считается закреплённым
        emp_card = self.client.get(f"/api/employees/{self.emp.id}/").data
        self.assertEqual(len(emp_card["equipment"]), 0)
        self.assertEqual(self.client.get("/api/employees/").data["results"][0]["equipment_count"], 0)

    def test_delete_equipment_forbidden(self):
        self.assertEqual(self.client.delete(f"/api/equipment/{self.eq_id}/").status_code, 405)
        self.assertTrue(self.client.get(f"/api/equipment/{self.eq_id}/").status_code == 200)


class CustomFieldAndHistoryTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(self.admin)
        self.type_id = self.client.post("/api/equipment-types/", {"name": "ПК"}, format="json").data["id"]
        self.eq_id = self.client.post(
            "/api/equipment/",
            {"inventory_number": "C-1", "equipment_type": self.type_id, "custom_fields": [{"name": "Кабинет", "value": "1"}]},
            format="json",
        ).data["id"]

    def test_custom_field_name_immutable_value_editable(self):
        cf = self.client.get(f"/api/equipment/{self.eq_id}/").data["custom_fields"][0]
        # пытаемся сменить и имя, и значение существующего поля
        resp = self.client.patch(
            f"/api/equipment/{self.eq_id}/",
            {"custom_fields": [{"id": cf["id"], "name": "ДРУГОЕ ИМЯ", "value": "2"}]},
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        cf2 = resp.data["custom_fields"][0]
        self.assertEqual(cf2["id"], cf["id"])
        self.assertEqual(cf2["name"], "Кабинет")  # имя не изменилось
        self.assertEqual(cf2["value"], "2")  # значение изменилось

    def test_history_records_custom_field_change(self):
        cf = self.client.get(f"/api/equipment/{self.eq_id}/").data["custom_fields"][0]
        self.client.patch(
            f"/api/equipment/{self.eq_id}/",
            {"custom_fields": [{"id": cf["id"], "name": "Кабинет", "value": "2"}]},
            format="json",
        )
        rows = self.client.get(f"/api/equipment/{self.eq_id}/history/").data
        changed = [(r["label"], r["old"], r["new"]) for r in rows if r["kind"] == "changed"]
        self.assertIn(("Кабинет", "1", "2"), changed)


class FileRequisiteDeleteTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(self.admin)
        self.type_id = self.client.post("/api/equipment-types/", {"name": "ПК"}, format="json").data["id"]
        self.file_field_id = self.client.post(
            f"/api/equipment-types/{self.type_id}/fields/",
            {"name": "Акт", "value_type": "file", "is_required": False},
            format="json",
        ).data["id"]
        self.eq_id = self.client.post(
            "/api/equipment/", {"inventory_number": "F-1", "equipment_type": self.type_id}, format="json"
        ).data["id"]

    def test_delete_file_requisite_returns_204(self):
        resp = self.client.delete(f"/api/equipment/{self.eq_id}/field-values/{self.file_field_id}/file/")
        self.assertEqual(resp.status_code, 204)


class LicenseAttachHistoryTests(APITestCase):
    """Привязка/снятие лицензии (связь на стороне License) отражается в истории
    самого Оборудования — движением «Установленная лицензия»."""

    def setUp(self):
        self.admin = User.objects.create_superuser(email="admin@example.com", password="Str0ng!Pass1")
        self.client.force_authenticate(self.admin)
        self.type_id = self.client.post(
            "/api/equipment-types/", {"name": "ПК", "allows_license": True}, format="json"
        ).data["id"]
        self.eq_id = self.client.post(
            "/api/equipment/",
            {"inventory_number": "INV-1", "equipment_type": self.type_id},
            format="json",
        ).data["id"]
        from licenses.models import License

        lt_id = self.client.post("/api/license-types/", {"name": "ПО"}, format="json").data["id"]
        self.lic = License.objects.create(name="Office 2021", license_type_id=lt_id)

    def test_attach_and_detach_appear_in_equipment_history(self):
        r = self.client.patch(f"/api/licenses/{self.lic.id}/", {"equipment": self.eq_id}, format="json")
        self.assertEqual(r.status_code, 200, r.data)
        r = self.client.patch(f"/api/licenses/{self.lic.id}/", {"equipment": None}, format="json")
        self.assertEqual(r.status_code, 200, r.data)
        rows = self.client.get(f"/api/equipment/{self.eq_id}/history/").data
        lic_rows = [row for row in rows if row["label"] == "Установленная лицензия"]
        pairs = {(row["old"], row["new"]) for row in lic_rows}
        self.assertIn(("—", "Office 2021"), pairs)  # установлена
        self.assertIn(("Office 2021", "—"), pairs)  # снята
