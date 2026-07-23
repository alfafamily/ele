from django.db.models import ProtectedError, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import filters, generics, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from core.eav import count_missing_for_field
from core.eav_filters import csv_ids, eav_req_conditions
from core.mixins import CreationCommentMixin
from core.pagination import ELECursorPagination
from core.permissions import IsAdminOrAccountant, IsAdminOrAccountantOrReadOnlyObserver
from storage.service import delete_stored_file, store_uploaded_file

from .models import (
    License,
    LicenseCustomField,
    LicenseFieldFile,
    LicenseFieldValue,
    LicenseType,
    LicenseTypeField,
)
from .serializers import (
    LicenseFieldValueOutSerializer,
    LicenseListSerializer,
    LicenseSerializer,
    LicenseTypeFieldSerializer,
    LicenseTypeSerializer,
)


class LicenseTypeViewSet(viewsets.ModelViewSet):
    queryset = LicenseType.objects.all().order_by("name").prefetch_related("fields__options")
    serializer_class = LicenseTypeSerializer
    permission_classes = [IsAdminOrAccountant]

    def destroy(self, request, *args, **kwargs):
        # ProtectedError покрывает и is_locked (модельный delete()), и
        # привязанные объекты (PROTECT на License.license_type).
        # Сообщение всегда своё, не техническое из исключения Django.
        try:
            return super().destroy(request, *args, **kwargs)
        except ProtectedError:
            return Response(
                {"detail": "Тип нельзя удалить — он базовый или к нему привязаны объекты. Доступно архивирование."},
                status=409,
            )


class LicenseTypeFieldListView(generics.ListCreateAPIView):
    serializer_class = LicenseTypeFieldSerializer
    permission_classes = [IsAdminOrAccountant]

    def get_queryset(self):
        return LicenseTypeField.objects.filter(license_type_id=self.kwargs["type_pk"]).prefetch_related("options")

    def perform_create(self, serializer):
        license_type = get_object_or_404(LicenseType, pk=self.kwargs["type_pk"])
        serializer.save(license_type=license_type)


class LicenseTypeFieldDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = LicenseTypeFieldSerializer
    permission_classes = [IsAdminOrAccountant]

    def get_queryset(self):
        return LicenseTypeField.objects.filter(license_type_id=self.kwargs["type_pk"]).prefetch_related("options")

    def destroy(self, request, *args, **kwargs):
        try:
            return super().destroy(request, *args, **kwargs)
        except ProtectedError:
            return Response({"detail": "Зафиксированный реквизит нельзя удалить."}, status=409)


class LicenseTypeFieldImpactView(APIView):
    permission_classes = [IsAdminOrAccountant]

    def get(self, request, type_pk, pk):
        field = get_object_or_404(LicenseTypeField, pk=pk, license_type_id=type_pk)
        license_qs = License.objects.filter(license_type_id=type_pk).prefetch_related("field_values")
        affected = count_missing_for_field(license_qs, field, "field_values")
        return Response({"affected_count": affected})


class LicenseViewSet(CreationCommentMixin, viewsets.ModelViewSet):
    """Обычному «Сотруднику» раздел недоступен — свои лицензии видны только в
    карточке привязанного Оборудования. Наблюдатель видит раздел на просмотр,
    но без «Номера/ключа» (см. get_serializer_context). Управление и удаление —
    admin/accountant; удаления нет — только утилизация (utilize)."""

    permission_classes = [IsAdminOrAccountantOrReadOnlyObserver]
    pagination_class = ELECursorPagination
    # DELETE разрешён только ради экшена удаления файла реквизита (ниже);
    # удаление самой Лицензии запрещено — destroy() отдаёт 405 (только
    # утилизация).
    http_method_names = ["get", "post", "put", "patch", "delete", "head", "options"]
    filter_backends = [filters.OrderingFilter]
    # B18: лицензия идентифицируется Типом — сортировка «по наименованию» идёт
    # по имени Типа. Алиас "name" оставлен для обратной совместимости запросов.
    ordering_fields = ["created_at", "name", "license_type__name", "equipment__inventory_number"]
    ordering = ["-created_at"]

    def destroy(self, request, *args, **kwargs):
        return Response({"detail": "Лицензия не удаляется — только утилизация."}, status=405)

    def get_serializer_class(self):
        return LicenseListSerializer if self.action == "list" else LicenseSerializer

    def get_serializer_context(self):
        context = super().get_serializer_context()
        # «Номер/ключ» — только Admin/Accountant. Наблюдатель видит раздел, но
        # секрет ему не отдаём ни в карточке (can_reveal_key → get_value
        # маскирует зафиксированный реквизит), ни в списке (include_key).
        is_staff = getattr(self.request.user, "role", None) in ("admin", "accountant")
        context["can_reveal_key"] = is_staff
        context["include_key"] = is_staff and self.request.query_params.get("include_key") in ("1", "true")
        return context

    def get_queryset(self):
        qs = License.objects.select_related(
            "equipment", "equipment__equipment_type", "license_type", "storage_place__room__building"
        ).prefetch_related(
            "field_values__field", "field_values__files__stored_file", "custom_fields"
        )
        # Фильтры списка — только для list; иначе карточка утилизированной
        # (архивной) Лицензии отдавала бы 404 и висла бы на лоадере (как было
        # с архивным Оборудованием).
        if self.action != "list":
            return qs

        tab = self.request.query_params.get("tab", "active")
        qs = qs.filter(is_retired=(tab == "archive"))

        status_param = self.request.query_params.get("status", "all")
        if status_param == "occupied":
            qs = qs.exclude(equipment__isnull=True)
        elif status_param == "free":
            qs = qs.filter(equipment__isnull=True)

        # B27. Фильтр по Типам (мультивыбор) + реквизитам выбранных Типов + Виду.
        type_ids = csv_ids(self.request.query_params.get("type"))
        if type_ids:
            qs = qs.filter(license_type_id__in=type_ids)
        for cond in eav_req_conditions(
            self.request.query_params,
            value_model=LicenseFieldValue,
            field_model=LicenseTypeField,
            object_fk="license",
            type_field="license_type",
        ):
            qs = qs.filter(cond)
        kind = self.request.query_params.get("kind")
        if kind in dict(LicenseType.Kind.choices):
            qs = qs.filter(license_type__kind=kind)

        # B27. «Закреплён за» → места хранения / оборудование (мультивыбор).
        storage_place = csv_ids(self.request.query_params.get("storage_place"))
        if storage_place:
            qs = qs.filter(storage_place_id__in=storage_place)
        equipment_ids = csv_ids(self.request.query_params.get("equipment"))
        if equipment_ids:
            qs = qs.filter(equipment_id__in=equipment_ids)

        search = self.request.query_params.get("search")
        if search:
            # Поиск по Типу лицензии и её Виду (Программная/Аппаратная); привязанному
            # Оборудованию (Тип оборудования, Название = Тип+Модель, Учётный номер) и
            # Названию места хранения. «Модель» — зафиксированный (is_locked) реквизит
            # Типа оборудования; join по equipment__field_values даёт дубли —
            # снимаем distinct().
            cond = (
                Q(name__icontains=search)
                | Q(license_type__name__icontains=search)
                | Q(equipment__equipment_type__name__icontains=search)
                | Q(
                    equipment__field_values__field__is_locked=True,
                    equipment__field_values__value_text__icontains=search,
                )
                | Q(equipment__inventory_number__icontains=search)
                | Q(storage_place__name__icontains=search)
            )
            # Вид хранится кодом (software/hardware) — сопоставляем по метке
            # («Программная»/«Аппаратная») с учётом неполного ввода.
            term = search.strip().lower()
            for code, label in LicenseType.Kind.choices:
                lab = label.lower()
                if term and (lab.startswith(term) or term.startswith(lab)):
                    cond |= Q(license_type__kind=code)
            qs = qs.filter(cond).distinct()
        return qs

    @action(detail=True, methods=["post"], permission_classes=[IsAdminOrAccountant])
    def utilize(self, request, pk=None):
        license_obj = self.get_object()
        license_obj.is_retired = True
        license_obj.retired_at = timezone.now()
        license_obj.equipment = None
        license_obj.storage_place = None
        comment = (request.data.get("comment") or "").strip()
        if comment:
            license_obj._change_reason = comment
        license_obj.save(update_fields=["is_retired", "retired_at", "equipment", "storage_place"])
        return Response(LicenseSerializer(license_obj).data)

    @action(detail=True, methods=["get"], url_path="history")
    def history_list(self, request, pk=None):
        from core.history import build_history_rows, build_related_history_rows
        from equipment.models import Equipment
        from storage.models import StoredFile

        lic = self.get_object()

        def fmt_equipment(v):
            if not v:
                return "Не привязана"
            inv = Equipment.objects.filter(pk=v).values_list("inventory_number", flat=True).first()
            return inv or "—"

        def fmt_type(v):
            t = LicenseType.objects.filter(pk=v).first() if v else None
            return t.name if t else "—"

        def fmt_storage(v):
            if not v:
                return "—"
            from locations.models import Place

            p = Place.objects.select_related("room__building").filter(pk=v).first()
            return f"Место хранения «{p.name}» ({p.room.building.name} — {p.room.name})" if p else "—"

        field_specs = {
            # B18: собственного Наименования у лицензии больше нет — в истории
            # не показываем (идентификация по Типу).
            "equipment": {"label": "Оборудование", "format": fmt_equipment, "in_created": False},
            "storage_place": {"label": "Место хранения", "format": fmt_storage, "in_created": False},
            "is_retired": {"label": "Признак утилизации", "format": lambda v: "Да" if v else "Нет", "in_created": False},
            "license_type": {"label": "Тип лицензии", "format": fmt_type},
        }

        # Реквизиты Типа (Параметры лицензии), включая маскируемый «Номер/ключ»
        type_fields = {}

        def field_of(rec):
            if rec.field_id not in type_fields:
                type_fields[rec.field_id] = LicenseTypeField.objects.filter(pk=rec.field_id).first()
            return type_fields[rec.field_id]

        def fv_value(rec):
            f = field_of(rec)
            vt = f.value_type if f else "text"
            if vt == "bool":
                return None if rec.value_bool is None else ("Да" if rec.value_bool else "Нет")
            if vt == "int":
                return rec.value_int
            if vt == "float":
                return rec.value_float
            if vt == "file":
                if not rec.value_file_id:
                    return None
                return StoredFile.objects.filter(pk=rec.value_file_id).values_list("original_filename", flat=True).first() or "файл"
            return rec.value_text

        def fv_secret(rec):
            # Зафиксированные реквизиты-ключи («Номер/ключ», «Номер/ID/Serial
            # токена») маскируются и в истории.
            f = field_of(rec)
            return bool(f and f.is_locked)

        related_rows = []
        created_extra = []

        # Реквизиты уже удалённых Типов (в т.ч. прежних базовых «Программная»/
        # «Аппаратная», которые пользователь удаляет после перевода лицензий на
        # свои Типы) в историю не выводим: их поле-реквизит удалено, поэтому
        # название и секретность не определяются — иначе бывший «Номер/ключ»
        # показался бы как «Реквизит» открытым текстом.
        existing_field_ids = set(LicenseTypeField.objects.values_list("id", flat=True))

        req_rows, req_created = build_related_history_rows(
            LicenseFieldValue.history.filter(license_id=lic.id, field_id__in=existing_field_ids),
            label_fn=lambda rec: (field_of(rec).name if field_of(rec) else "Реквизит"),
            value_fn=fv_value,
            secret_fn=fv_secret,
            created_at=lic.created_at,
        )
        related_rows += req_rows
        created_extra += req_created

        # Файлы реквизитов «Несколько файлов» — добавление/удаление отдельных файлов.
        fv_field_name = dict(
            LicenseFieldValue.objects.filter(license_id=lic.id).values_list("id", "field__name")
        )
        if fv_field_name:
            def file_value(rec):
                if not rec.stored_file_id:
                    return None
                return (
                    StoredFile.objects.filter(pk=rec.stored_file_id)
                    .values_list("original_filename", flat=True)
                    .first()
                    or "файл"
                )

            file_rows, file_created = build_related_history_rows(
                LicenseFieldFile.history.filter(field_value_id__in=list(fv_field_name)),
                label_fn=lambda rec: fv_field_name.get(rec.field_value_id, "Файл реквизита"),
                value_fn=file_value,
                created_at=lic.created_at,
            )
            related_rows += file_rows
            created_extra += file_created

        cf_rows, cf_created = build_related_history_rows(
            LicenseCustomField.history.filter(license_id=lic.id),
            label_fn=lambda rec: rec.name,
            value_fn=lambda rec: rec.value,
            created_at=lic.created_at,
        )
        related_rows += cf_rows
        created_extra += cf_created

        rows = build_history_rows(
            lic, field_specs,
            movement_fields={"equipment", "storage_place"},
            movement_events=[{
                "trigger": "is_retired", "to": True,
                "consume": ["is_retired", "retired_at", "equipment", "storage_place"],
                "label": "Утилизирована",
            }],
            created_extra_lines=created_extra,
        )
        rows += related_rows

        # «Номер/ключ» (и серийник токена) в истории — секрет: значение уходит
        # клиенту (там маскируется за «глазиком») только тем, кому можно раскрыть
        # ключ (admin/accountant). Наблюдателю секретные значения не отдаём вовсе:
        # заменяем на маску и снимаем флаг secret (раскрывать нечего).
        can_reveal = getattr(request.user, "role", None) in ("admin", "accountant")
        if not can_reveal:
            mask = "••••"
            for r in rows:
                if r.get("secret"):
                    if r.get("old") not in (None, "—"):
                        r["old"] = mask
                    if r.get("new") not in (None, "—"):
                        r["new"] = mask
                    r["secret"] = False
                for ln in r.get("lines") or []:
                    if ln.get("secret"):
                        ln["value"] = mask
                        ln["secret"] = False

        rows.sort(key=lambda r: r["date"], reverse=True)
        return Response(rows)

    @action(
        detail=True,
        methods=["post", "delete"],
        url_path=r"field-values/(?P<field_id>[^/.]+)/file",
        permission_classes=[IsAdminOrAccountant],
    )
    def upload_field_file(self, request, pk=None, field_id=None):
        license_obj = self.get_object()
        field = get_object_or_404(LicenseTypeField, pk=field_id, license_type=license_obj.license_type)
        if field.value_type != "file":
            return Response({"detail": "Реквизит не файлового типа."}, status=400)

        # Удаление прикреплённого файла реквизита (не только замена).
        if request.method == "DELETE":
            field_value = LicenseFieldValue.objects.filter(license=license_obj, field=field).first()
            if field_value and field_value.value_file_id:
                delete_stored_file(field_value.value_file)
                field_value.value_file = None
                field_value.save(update_fields=["value_file"])
            return Response(status=204)

        # getlist — allow_multiple разрешает выбрать несколько файлов за раз
        # (одиночный присылает один). Валидируем все до сохранения.
        file_objs = request.FILES.getlist("file")
        if not file_objs:
            return Response({"detail": "Файл не передан."}, status=400)
        for f in file_objs:
            if f.size > 20 * 1024 * 1024:
                return Response({"detail": f"Файл «{f.name}» больше 20 МБ."}, status=400)

        field_value, created = LicenseFieldValue.objects.get_or_create(license=license_obj, field=field)
        if field.allow_multiple:
            # Несколько файлов — добавляем в дочернюю таблицу; переносим legacy
            # одиночный файл, если он был (флаг включили позже).
            if field_value.value_file_id:
                LicenseFieldFile.objects.create(field_value=field_value, stored_file=field_value.value_file)
                field_value.value_file = None
                field_value.save(update_fields=["value_file"])
            for f in file_objs:
                stored = store_uploaded_file(f, "licenses/fields")
                LicenseFieldFile.objects.create(field_value=field_value, stored_file=stored)
        else:
            # Одиночный реквизит — берём первый файл, заменяя прежний.
            stored_file = store_uploaded_file(file_objs[0], "licenses/fields")
            if not created:
                delete_stored_file(field_value.value_file)
            field_value.value_file = stored_file
            field_value.save(update_fields=["value_file"])
        return Response(LicenseFieldValueOutSerializer(field_value).data)

    @action(
        detail=True,
        methods=["delete"],
        url_path=r"field-values/(?P<field_id>[^/.]+)/files/(?P<file_pk>[^/.]+)",
        permission_classes=[IsAdminOrAccountant],
    )
    def delete_field_file(self, request, pk=None, field_id=None, file_pk=None):
        license_obj = self.get_object()
        field_file = get_object_or_404(
            LicenseFieldFile,
            pk=file_pk,
            field_value__license=license_obj,
            field_value__field_id=field_id,
        )
        stored = field_file.stored_file
        field_file.delete()
        delete_stored_file(stored)
        return Response(status=204)
