"""Базовый вьюсет учётных приложений (B53-R1).

Четыре приложения — ``equipment`` / ``transport`` / ``licenses`` / ``tools`` —
это одна концепция: поэкземплярный (или количественный у инструментов) учётный
объект с типом-реквизитами (EAV), историей движений, защитой от удаления (только
списание/утилизация) и курсорной пагинацией. Раньше каждое переписывало этот
каркас у себя, из-за чего копии ``destroy`` / ``upload_field_file`` /
``delete_field_file`` расходились по сложности (см. отчёт B53, оси 1+3).

Здесь — общий каркас:

* :class:`AccountableAssetViewSet` — пагинация, набор HTTP-методов, защита от
  удаления (``destroy`` → 405 с сообщением приложения), сортировка + комментарий
  при создании (через :class:`core.mixins.CreationCommentMixin`).
* :class:`AssetFieldFileMixin` — загрузка/удаление файлов-реквизитов EAV
  (``upload_field_file`` / ``delete_field_file``) для приложений с файловыми
  реквизитами (equipment / transport / licenses; у инструментов их нет).

SIM («Корп. связь») и Средства доступа (AccessPass) сюда НЕ входят: у них нет
EAV-реквизитов с файлами и ТО, а размещение — своё (см. отчёт B53, R4).
"""

from rest_framework import filters, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.generics import get_object_or_404

from core.mixins import CreationCommentMixin
from core.pagination import ELECursorPagination
from core.permissions import IsAdminOrAccountant


class AccountableAssetViewSet(CreationCommentMixin, viewsets.ModelViewSet):
    """Общий каркас учётного вьюсета. Конкретные приложения задают
    ``serializer_class`` / ``permission_classes`` / ``get_queryset`` / поля
    сортировки, а также сообщение о запрете удаления."""

    pagination_class = ELECursorPagination
    filter_backends = [filters.OrderingFilter]
    # DELETE в наборе методов нужен только для экшенов удаления файла реквизита
    # (см. AssetFieldFileMixin); удаление самого объекта запрещено — destroy()
    # ниже отдаёт 405 (только списание/утилизация).
    http_method_names = ["get", "post", "put", "patch", "delete", "head", "options"]

    # Сообщение при попытке удалить объект. Задаётся приложением; пусто —
    # обычное удаление разрешено.
    delete_forbidden_detail = None

    def destroy(self, request, *args, **kwargs):
        if self.delete_forbidden_detail:
            return Response({"detail": self.delete_forbidden_detail}, status=405)
        return super().destroy(request, *args, **kwargs)


class AssetFieldFileMixin:
    """Загрузка и удаление файлов-реквизитов EAV.

    Подмешивается перед :class:`AccountableAssetViewSet`. Логика одинакова для
    equipment / transport / licenses — различаются только модели и имена FK,
    задаваемые атрибутами класса:

    * ``asset_owner_field`` — имя FK на сам объект в моделях значения/файла
      (``"equipment"`` / ``"transport"`` / ``"license"``);
    * ``asset_type_field``  — имя FK на Тип у объекта и у модели реквизита
      (``"equipment_type"`` / ``"transport_type"`` / ``"license_type"``);
    * ``type_field_model`` / ``field_value_model`` / ``field_file_model``;
    * ``field_value_out_serializer`` — сериализатор ответа при загрузке;
    * ``field_file_storage_dir`` — подкаталог хранилища (``"equipment/fields"``).
    """

    asset_owner_field = None
    asset_type_field = None
    type_field_model = None
    field_value_model = None
    field_file_model = None
    field_value_out_serializer = None
    field_file_storage_dir = None

    @action(
        detail=True,
        methods=["post", "delete"],
        url_path=r"field-values/(?P<field_id>[^/.]+)/file",
        permission_classes=[IsAdminOrAccountant],
    )
    def upload_field_file(self, request, pk=None, field_id=None):
        from storage.service import delete_stored_file, store_uploaded_file

        asset = self.get_object()
        field = get_object_or_404(
            self.type_field_model,
            pk=field_id,
            **{self.asset_type_field: getattr(asset, self.asset_type_field)},
        )
        if field.value_type != "file":
            return Response({"detail": "Реквизит не файлового типа."}, status=400)
        owner = {self.asset_owner_field: asset}

        # Удаление одиночного файла реквизита (не только замена). Для реквизитов
        # с несколькими файлами удаление — через delete_field_file по id файла.
        if request.method == "DELETE":
            field_value = self.field_value_model.objects.filter(field=field, **owner).first()
            if field_value and field_value.value_file_id:
                delete_stored_file(field_value.value_file)
                field_value.value_file = None
                field_value.save(update_fields=["value_file"])
            return Response(status=204)

        # getlist — реквизит с allow_multiple разрешает выбрать несколько файлов
        # за один раз (одиночный присылает один). Валидируем все до сохранения.
        file_objs = request.FILES.getlist("file")
        if not file_objs:
            return Response({"detail": "Файл не передан."}, status=400)
        from company.limits import max_upload_bytes, max_upload_mb

        limit, limit_mb = max_upload_bytes(), max_upload_mb()
        for f in file_objs:
            if f.size > limit:
                return Response({"detail": f"Файл «{f.name}» больше {limit_mb} МБ."}, status=400)

        field_value, created = self.field_value_model.objects.get_or_create(field=field, **owner)
        if field.allow_multiple:
            # Несколько файлов — добавляем в дочернюю таблицу. Если у реквизита
            # остался legacy одиночный value_file (флаг включили позже) —
            # переносим его туда же для единообразия.
            if field_value.value_file_id:
                self.field_file_model.objects.create(field_value=field_value, stored_file=field_value.value_file)
                field_value.value_file = None
                field_value.save(update_fields=["value_file"])
            for f in file_objs:
                stored = store_uploaded_file(f, self.field_file_storage_dir)
                self.field_file_model.objects.create(field_value=field_value, stored_file=stored)
        else:
            # Одиночный реквизит — берём первый файл, заменяя прежний.
            stored_file = store_uploaded_file(file_objs[0], self.field_file_storage_dir)
            if not created:
                delete_stored_file(field_value.value_file)
            field_value.value_file = stored_file
            field_value.save(update_fields=["value_file"])
        return Response(self.field_value_out_serializer(field_value).data)

    @action(
        detail=True,
        methods=["delete"],
        url_path=r"field-values/(?P<field_id>[^/.]+)/files/(?P<file_pk>[^/.]+)",
        permission_classes=[IsAdminOrAccountant],
    )
    def delete_field_file(self, request, pk=None, field_id=None, file_pk=None):
        from storage.service import delete_stored_file

        asset = self.get_object()
        field_file = get_object_or_404(
            self.field_file_model,
            pk=file_pk,
            field_value__field_id=field_id,
            **{f"field_value__{self.asset_owner_field}": asset},
        )
        stored = field_file.stored_file
        field_file.delete()
        delete_stored_file(stored)
        return Response(status=204)
