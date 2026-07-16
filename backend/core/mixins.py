"""Общие миксины для DRF-вьюсетов."""


class CreationCommentMixin:
    """Необязательный комментарий при создании объекта: пишем его в
    history_change_reason записи «+» (запись создания), чтобы показать в истории
    движений рядом с перечнем заполненных полей. Ожидает поле `comment` в теле
    запроса на создание.

    Пишем именно в запись «+», а не в самую свежую (update_change_reason): у
    объектов с m2m-историей (AccessPass) установка M2M после создания порождает
    более позднюю запись, и комментарий уходил бы не туда."""

    def perform_create(self, serializer):
        instance = serializer.save()
        comment = (self.request.data.get("comment") or "").strip()
        if comment:
            created = instance.history.filter(history_type="+").order_by("history_date").first()
            if created is not None:
                created.history_change_reason = comment
                created.save(update_fields=["history_change_reason"])
