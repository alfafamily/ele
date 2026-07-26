"""Восстановление системы из резервной копии — ТОЛЬКО через CLI на сервере
(жёсткое ограничение: никакого API/UI restore-эндпоинта).

Восстановление — это ПОЛНАЯ ЗАМЕНА состояния: инстанс становится точной копией
выбранного бэкапа. Всё, что было создано после этого бэкапа, теряется. Работает
и на пустой БД (свежий инстанс), и на заполненной (действующий инстанс — тогда
текущие данные очищаются перед загрузкой).

Форматы:
- v2 (актуальный): архив .tar.gz (db.json + files/<pk>.bin + manifest.json),
  опционально зашифрован (.enc). Полный дамп БД + бинарники файлов.
- v1 (устаревший): один .json (ручной перечень моделей, файлы ссылками) —
  читается для совместимости со старыми копиями.

Примеры:
    python manage.py restore_backup /path/ele-backup-....tar.gz
    python manage.py restore_backup --from-secondary-s3           # выбрать из списка
    python manage.py restore_backup --from-secondary-s3 ele-backup-....tar.gz.enc -p 'пароль'
"""
import json
import os
import tempfile

from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from backup import archive as archive_mod
from backup.export import RESTORE_ORDER, migration_state


class Command(BaseCommand):
    help = (
        "Восстанавливает систему из резервной копии (ПОЛНАЯ замена текущего "
        "состояния). Поддерживает архив v2 (БД + файлы, опц. шифрование) и "
        "устаревший v1 JSON. Пароли восстанавливаются как есть (хэши)."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "file",
            nargs="?",
            help="Путь к файлу копии, либо имя объекта в резервном S3 (с --from-secondary-s3).",
        )
        parser.add_argument(
            "--from-secondary-s3",
            action="store_true",
            help="Скачать копию из резервного S3 (креды из .env BACKUP_S3_*). Без имени — выбрать из списка.",
        )
        parser.add_argument("--passphrase", "-p", help="Парольная фраза для расшифровки архива.")
        parser.add_argument("--noinput", action="store_true", help="Без интерактивных подтверждений.")
        parser.add_argument(
            "--allow-schema-mismatch",
            action="store_true",
            help="Продолжить, даже если версия схемы (миграции) копии не совпадает с текущей.",
        )
        parser.add_argument(
            "--no-safety-backup",
            action="store_true",
            help="Не делать страховочную копию текущего состояния перед заменой.",
        )

    def handle(self, *args, **options):
        self.noinput = options["noinput"]
        tmp_dir = tempfile.mkdtemp(prefix="ele-restore-")
        cleanup = [tmp_dir]
        try:
            local_path = self._resolve_source(options, tmp_dir)
            plaintext_path = self._decrypt_if_needed(local_path, options, tmp_dir)
            self._restore(plaintext_path, options, tmp_dir)
        finally:
            self._cleanup(cleanup)

    # --- Источник копии ---

    def _resolve_source(self, options, tmp_dir) -> str:
        if not options["from_secondary_s3"]:
            path = options["file"]
            if not path:
                raise CommandError("Укажите путь к файлу копии или используйте --from-secondary-s3.")
            if not os.path.exists(path):
                raise CommandError(f"Файл не найден: {path}")
            return path

        from backup.destinations import download_secondary_s3, list_secondary_s3_backups, secondary_s3_configured

        if not secondary_s3_configured():
            raise CommandError("Резервный S3 не настроен в .env (BACKUP_S3_*).")

        object_key = options["file"]
        if not object_key:
            object_key = self._pick_from_s3(list_secondary_s3_backups())

        dst = os.path.join(tmp_dir, "downloaded.bak")
        self.stdout.write(f"Скачиваю из резервного S3: {object_key} …")
        download_secondary_s3(object_key, dst)
        return dst

    def _pick_from_s3(self, items) -> str:
        if not items:
            raise CommandError("В резервном S3 нет копий.")
        if self.noinput:
            raise CommandError("С --noinput укажите имя объекта явно (интерактивный выбор недоступен).")
        self.stdout.write("Доступные копии в резервном S3:")
        for i, it in enumerate(items, 1):
            size_mb = (it["size"] or 0) / 1024 / 1024
            when = it["last_modified"].strftime("%d.%m.%Y %H:%M") if it.get("last_modified") else "—"
            self.stdout.write(f"  {i}. {it['filename']}  ({size_mb:.1f} МБ, {when})")
        raw = input("Номер копии для восстановления: ").strip()
        try:
            idx = int(raw) - 1
            return items[idx]["key"]
        except (ValueError, IndexError):
            raise CommandError("Некорректный выбор.")

    def _decrypt_if_needed(self, path, options, tmp_dir) -> str:
        if not archive_mod.is_encrypted(path):
            return path
        passphrase = options.get("passphrase")
        if not passphrase:
            if self.noinput:
                raise CommandError("Архив зашифрован — задайте --passphrase.")
            import getpass

            passphrase = getpass.getpass("Парольная фраза для расшифровки: ")
        dst = os.path.join(tmp_dir, "decrypted.tar.gz")
        try:
            archive_mod.decrypt_file(path, dst, passphrase)
        except Exception as exc:  # noqa: BLE001 — InvalidTag и пр.
            raise CommandError(f"Не удалось расшифровать архив (неверный пароль или повреждение): {exc}")
        return dst

    # --- Восстановление ---

    def _restore(self, path, options, tmp_dir):
        import tarfile

        if tarfile.is_tarfile(path):
            self._restore_v2(path, options, tmp_dir)
        else:
            self._restore_v1_file(path)

    def _restore_v2(self, path, options, tmp_dir):
        import tarfile

        with tarfile.open(path, "r:gz") as tar:
            manifest = json.loads(tar.extractfile("manifest.json").read().decode("utf-8"))

            self._check_schema(manifest, options)
            self._confirm()
            self._safety_backup(options)

            db_json = os.path.join(tmp_dir, "db.json")
            archive_mod.extract_member_to(tar, "db.json", db_json)

            with transaction.atomic():
                # Полная замена: очищаем текущие данные, затем грузим дамп.
                call_command("flush", "--noinput")
                call_command("loaddata", db_json, verbosity=0)
                # Дамп таблицы storage мог содержать метаданные архивов прошлых
                # копий (подкаталог backups/), чьих бинарников в архиве нет —
                # это осиротевшие ссылки, удаляем.
                from storage.models import StoredFile
                from backup.export import BACKUP_SUBDIR

                StoredFile.objects.filter(path__startswith=f"{BACKUP_SUBDIR}/").delete()
                restored_files, missing = self._restore_files(tar, manifest, tmp_dir)

        self.stdout.write(
            self.style.SUCCESS(
                f"Восстановление завершено. Файлов размещено: {restored_files}"
                + (f", пропущено (отсутствовали): {missing}" if missing else "")
            )
        )

    def _restore_files(self, tar, manifest, tmp_dir):
        """Раскладывает бинарники в ТЕКУЩЕЕ целевое хранилище инстанса (может
        отличаться от исходного) и обновляет StoredFile.backend/path."""
        from storage.backends import get_backend, target_backend_name
        from storage.models import StoredFile

        backend_name = target_backend_name()
        backend = get_backend(backend_name)
        restored = 0
        missing = 0
        for entry in manifest.get("files", []):
            if entry.get("missing"):
                missing += 1
                continue
            pk = entry["pk"]
            arcname = entry["arcname"]
            tmp_file = os.path.join(tmp_dir, f"f_{pk}.bin")
            try:
                archive_mod.extract_member_to(tar, arcname, tmp_file)
            except KeyError:
                missing += 1
                continue
            # Сверка целостности с manifest.
            if entry.get("checksum") and archive_mod.sha256_file(tmp_file) != entry["checksum"]:
                raise CommandError(f"Контрольная сумма файла pk={pk} не совпала — архив повреждён.")
            ext = entry["path"].rsplit(".", 1)[-1] if "." in entry["path"].rsplit("/", 1)[-1] else ""
            from django.utils.crypto import get_random_string

            subdir = entry["path"].rsplit("/", 1)[0] if "/" in entry["path"] else "files"
            new_name = get_random_string(24)
            new_path = f"{subdir}/{new_name}.{ext}" if ext else f"{subdir}/{new_name}"
            with open(tmp_file, "rb") as fh:
                saved = backend.save(new_path, fh)
            StoredFile.objects.filter(pk=pk).update(backend=backend_name, path=saved)
            os.remove(tmp_file)
            restored += 1
        return restored, missing

    def _check_schema(self, manifest, options):
        backup_schema = manifest.get("schema_version") or {}
        current = migration_state()
        if backup_schema == current:
            return
        if options["allow_schema_mismatch"]:
            self.stdout.write(self.style.WARNING("Версия схемы копии не совпадает с текущей — продолжаю по флагу."))
            return
        diff_apps = sorted(set(backup_schema) | set(current))
        details = []
        for app in diff_apps:
            if backup_schema.get(app) != current.get(app):
                details.append(app)
        raise CommandError(
            "Версия схемы копии не совпадает с текущим инстансом (различия в приложениях: "
            + ", ".join(details or ["—"])
            + "). Приведите миграции в соответствие или используйте --allow-schema-mismatch."
        )

    def _confirm(self):
        if self.noinput:
            return
        self.stdout.write(
            self.style.WARNING(
                "ВНИМАНИЕ: текущее состояние системы будет ПОЛНОСТЬЮ заменено содержимым копии. "
                "Все данные, созданные после этой копии, будут потеряны. Операция необратима."
            )
        )
        answer = input("Введите 'yes' для продолжения: ").strip()
        if answer != "yes":
            raise CommandError("Восстановление отменено.")

    def _safety_backup(self, options):
        if options["no_safety_backup"]:
            return
        from accounts.models import User

        # На пустой БД (свежий инстанс) страховать нечего.
        if not User.objects.exists():
            return
        from backup.models import BackupRecord
        from backup.service import create_backup

        self.stdout.write("Создаю страховочную копию текущего состояния …")
        try:
            create_backup(BackupRecord.BackupType.MANUAL)
        except Exception as exc:  # noqa: BLE001
            if not self.noinput:
                cont = input(f"Не удалось создать страховочную копию ({exc}). Продолжить всё равно? [yes/no]: ")
                if cont.strip() != "yes":
                    raise CommandError("Восстановление отменено (нет страховочной копии).")
            else:
                self.stdout.write(self.style.WARNING(f"Страховочная копия не создана: {exc}"))

    # --- v1 (устаревший JSON) ---

    def _restore_v1_file(self, path):
        try:
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
        except OSError as exc:
            raise CommandError(f"Не удалось открыть файл: {exc}")
        except json.JSONDecodeError as exc:
            raise CommandError(f"Файл повреждён или не является валидным JSON: {exc}")
        self._confirm()
        self._restore_v1(data)
        self.stdout.write(self.style.SUCCESS("Восстановление (v1) завершено."))

    def _restore_v1(self, data):
        from django.core import serializers

        with transaction.atomic():
            for key in RESTORE_ORDER:
                entries = data.get(key, [])
                if key == "stored_files":
                    for entry in entries:
                        entry["fields"].pop("url", None)
                count = 0
                for deserialized_obj in serializers.deserialize("json", json.dumps(entries)):
                    deserialized_obj.save()
                    count += 1
                self.stdout.write(f"{key}: {count}")

    def _cleanup(self, paths):
        import shutil

        for p in paths:
            if os.path.isdir(p):
                shutil.rmtree(p, ignore_errors=True)
            elif os.path.exists(p):
                try:
                    os.remove(p)
                except OSError:
                    pass
