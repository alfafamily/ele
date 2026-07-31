// Типы значений динамических реквизитов Типа — общие для
// EquipmentTypeField и LicenseTypeField.
export const VALUE_TYPE_LABELS = {
  text: 'Текст',
  bool: 'Да/Нет',
  int: 'Целое число',
  float: 'Дробное число',
  file: 'Файл',
  list: 'Список',
}

export const VALUE_TYPE_OPTIONS = Object.entries(VALUE_TYPE_LABELS).map(([value, label]) => ({ value, label }))

// Клиентская проверка обязательных реквизитов Типа до отправки формы —
// зеркало backend missing_required_fields/is_value_empty (core/eav.py). Возвращает
// { [field.id]: 'Заполните обязательное поле.' } для незаполненных обязательных
// реквизитов. Пусто = null/'' (для bool «Нет»=false считается заполненным).
// Файловые реквизиты пропускаем: файл прикладывается отдельным эндпоинтом уже
// после создания объекта — обязательность файла проверяет бэкенд.
export function requiredValueErrors(typeFields, values) {
  const errors = {}
  for (const f of typeFields || []) {
    if (f.value_type === 'file' || !f.is_required) continue
    const v = values?.[f.id]
    if (v == null || v === '') errors[f.id] = 'Заполните обязательное поле.'
  }
  return errors
}
