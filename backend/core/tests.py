from django.core.management import call_command
from rest_framework.test import APITestCase

from company.models import Company

from .ip_allowlist import is_ip_allowed


class IsIPAllowedTests(APITestCase):
    """Модульная проверка сопоставления IP/CIDR (§3.1) — независимо от HTTP-слоя."""

    def test_empty_allowlist_means_unrestricted(self):
        self.assertTrue(is_ip_allowed("1.2.3.4", []))

    def test_exact_match(self):
        self.assertTrue(is_ip_allowed("10.0.0.5", ["10.0.0.5"]))
        self.assertFalse(is_ip_allowed("10.0.0.6", ["10.0.0.5"]))

    def test_cidr_match(self):
        self.assertTrue(is_ip_allowed("195.19.0.42", ["195.19.0.0/16"]))
        self.assertFalse(is_ip_allowed("195.20.0.1", ["195.19.0.0/16"]))

    def test_garbage_client_ip_is_rejected_not_500(self):
        self.assertFalse(is_ip_allowed("not-an-ip", ["10.0.0.0/8"]))

    def test_garbage_allowlist_entry_is_skipped(self):
        self.assertTrue(is_ip_allowed("10.0.0.5", ["not-an-entry", "10.0.0.5"]))


class IPCheckViewTests(APITestCase):
    """§3.1, §7.2 — эндпоинт для Caddy forward_auth. Реальный IP клиента
    берётся из ПОСЛЕДНЕГО значения X-Forwarded-For (Caddy сам его дописывает
    последним; более ранние значения мог подделать клиент)."""

    def test_no_restriction_by_default(self):
        resp = self.client.get("/api/internal/ip-check/")
        self.assertEqual(resp.status_code, 200)

    def test_blocks_ip_outside_allowlist(self):
        company = Company.load()
        company.ip_allowlist = ["203.0.113.0/24"]
        company.save()
        resp = self.client.get("/api/internal/ip-check/", HTTP_X_FORWARDED_FOR="198.51.100.7")
        self.assertEqual(resp.status_code, 403)

    def test_allows_ip_inside_allowlist(self):
        company = Company.load()
        company.ip_allowlist = ["203.0.113.0/24"]
        company.save()
        resp = self.client.get("/api/internal/ip-check/", HTTP_X_FORWARDED_FOR="203.0.113.42")
        self.assertEqual(resp.status_code, 200)

    def test_trusts_last_xff_entry_not_first(self):
        # Первое значение — то, что мог подделать клиент; последнее — то, что
        # реально дописал Caddy. Разрешённый только последний адрес.
        company = Company.load()
        company.ip_allowlist = ["203.0.113.0/24"]
        company.save()
        resp = self.client.get(
            "/api/internal/ip-check/", HTTP_X_FORWARDED_FOR="203.0.113.42, 198.51.100.7"
        )
        self.assertEqual(resp.status_code, 403)


class ResetIPAllowlistCommandTests(APITestCase):
    def test_clears_allowlist(self):
        company = Company.load()
        company.ip_allowlist = ["10.0.0.0/8"]
        company.save()
        call_command("reset_ip_allowlist")
        company.refresh_from_db()
        self.assertEqual(company.ip_allowlist, [])

    def test_noop_when_already_empty(self):
        call_command("reset_ip_allowlist")  # не должно падать
        self.assertEqual(Company.load().ip_allowlist, [])
