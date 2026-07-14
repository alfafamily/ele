// Типы значений динамических реквизитов Типа — общие для
// EquipmentTypeField и LicenseTypeField.
export const VALUE_TYPE_LABELS = {
  text: 'Текст',
  bool: 'Да/Нет',
  int: 'Целое число',
  float: 'Дробное число',
  file: 'Файл',
}

export const VALUE_TYPE_OPTIONS = Object.entries(VALUE_TYPE_LABELS).map(([value, label]) => ({ value, label }))
