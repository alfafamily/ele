# B29: полные бэкапы (БД + файлы) + статусы назначений.
import django.db.models.deletion
from django.db import migrations, models


def backfill_v1_records(apps, schema_editor):
    """Существующие копии — старого формата (v1 JSON, лежат в своём хранилище).
    Проставляем format/filename/size и заводим им один OWN-статус (успешный),
    чтобы UI единообразно показывал назначения и для старых записей."""
    BackupRecord = apps.get_model("backup", "BackupRecord")
    BackupDestinationStatus = apps.get_model("backup", "BackupDestinationStatus")
    for record in BackupRecord.objects.select_related("file").all():
        record.format = "v1_json"
        if record.file:
            record.filename = record.file.original_filename or ""
            record.size = record.file.size or 0
            record.checksum = record.file.checksum or ""
        record.save(update_fields=["format", "filename", "size", "checksum"])
        if record.file:
            BackupDestinationStatus.objects.get_or_create(
                backup=record,
                destination="own",
                defaults={"ok": True, "stored_file": record.file, "size": record.file.size or 0},
            )


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("storage", "0001_initial"),
        ("backup", "0001_initial"),
    ]

    operations = [
        migrations.AlterField(
            model_name="backuprecord",
            name="file",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="+",
                to="storage.storedfile",
            ),
        ),
        migrations.AddField(
            model_name="backuprecord",
            name="format",
            field=models.CharField(
                choices=[("v1_json", "JSON (устар.)"), ("v2_archive", "Архив (БД + файлы)")],
                default="v2_archive",
                max_length=12,
            ),
        ),
        migrations.AddField(
            model_name="backuprecord",
            name="encrypted",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="backuprecord",
            name="filename",
            field=models.CharField(blank=True, max_length=255),
        ),
        migrations.AddField(
            model_name="backuprecord",
            name="size",
            field=models.PositiveBigIntegerField(default=0),
        ),
        migrations.AddField(
            model_name="backuprecord",
            name="checksum",
            field=models.CharField(blank=True, max_length=64),
        ),
        migrations.AddField(
            model_name="backuprecord",
            name="app_version",
            field=models.CharField(blank=True, max_length=32),
        ),
        migrations.CreateModel(
            name="BackupDestinationStatus",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "destination",
                    models.CharField(
                        choices=[("own", "Своё хранилище"), ("secondary_s3", "Резервный S3")], max_length=16
                    ),
                ),
                ("ok", models.BooleanField(default=False)),
                ("error", models.TextField(blank=True)),
                ("object_key", models.CharField(blank=True, max_length=500)),
                ("size", models.PositiveBigIntegerField(default=0)),
                (
                    "backup",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="destinations",
                        to="backup.backuprecord",
                    ),
                ),
                (
                    "stored_file",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="+",
                        to="storage.storedfile",
                    ),
                ),
            ],
            options={
                "verbose_name": "Статус назначения копии",
                "verbose_name_plural": "Статусы назначений копии",
                "unique_together": {("backup", "destination")},
            },
        ),
        migrations.RunPython(backfill_v1_records, noop),
    ]
