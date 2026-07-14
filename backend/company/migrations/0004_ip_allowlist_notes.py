"""IP-allowlist: строки → словари {"ip", "note"} (примечание к каждому адресу).

Хранение осталось в том же JSONField, меняется только формат содержимого,
поэтому это data-миграция без изменения схемы."""
from django.db import migrations


def to_dicts(apps, schema_editor):
    Company = apps.get_model("company", "Company")
    for company in Company.objects.all():
        changed = False
        new = []
        for entry in company.ip_allowlist or []:
            if isinstance(entry, str):
                new.append({"ip": entry, "note": ""})
                changed = True
            elif isinstance(entry, dict):
                new.append({"ip": entry.get("ip", ""), "note": entry.get("note", "")})
            # прочее (мусор) — отбрасываем
        if changed or new != (company.ip_allowlist or []):
            company.ip_allowlist = new
            company.save(update_fields=["ip_allowlist"])


def to_strings(apps, schema_editor):
    Company = apps.get_model("company", "Company")
    for company in Company.objects.all():
        new = [e.get("ip", "") if isinstance(e, dict) else str(e) for e in (company.ip_allowlist or [])]
        company.ip_allowlist = [ip for ip in new if ip]
        company.save(update_fields=["ip_allowlist"])


class Migration(migrations.Migration):
    dependencies = [("company", "0003_company_auto_backup_enabled_and_more")]
    operations = [migrations.RunPython(to_dicts, to_strings)]
