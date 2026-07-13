"""Курсорная пагинация для всех списков (ТЗ §8.7) — не offset/limit, чтобы
бесконечная подгрузка по скроллу не давала пропусков/дублей при добавлении
новых объектов. Штатный класс DRF полностью покрывает требование — свой
протокол не нужен."""
from rest_framework.pagination import CursorPagination


class ELECursorPagination(CursorPagination):
    page_size = 30
    ordering = "-created_at"  # переопределяется per-viewset под §5.1/5.2/5.3
    cursor_query_param = "cursor"
