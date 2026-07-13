"""Валидация загружаемых изображений (Лого Компании §3.1, Аватар Сотрудника
§3.3 — оба «не более 600×600 px»)."""
from PIL import Image


def validate_image_max_dimensions(file_obj, max_width: int, max_height: int) -> None:
    file_obj.seek(0)
    try:
        width, height = Image.open(file_obj).size
    finally:
        file_obj.seek(0)
    if width > max_width or height > max_height:
        raise ValueError(f"Изображение должно быть не больше {max_width}×{max_height}px (сейчас {width}×{height}px).")
