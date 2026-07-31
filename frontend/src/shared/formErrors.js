// Разбор ошибки API на ошибки конкретных полей и общий текст для баннера.
// Формат ответа (см. core/exceptions.py): {"errors": {"поле": ["текст", …]}}
// для ошибок валидации, либо {"detail": "…"} для общих ошибок (403/404/…).
//
// non_field_errors и любые ключи из bannerKeys не относятся к одному видимому
// полю (агрегаты вроде field_values, кросс-полевые проверки) — их показываем
// в баннере формы. Остальные ключи раскладываются под соответствующие поля
// (через проп error компонентов Input/Select/PlaceSelect/FieldValueInput).
export function splitApiError(err, { bannerKeys = [] } = {}) {
  const errors = err?.errors
  if (!errors || typeof errors !== 'object') {
    return { fieldErrors: {}, formError: err?.detail || null }
  }
  const fieldErrors = {}
  const banner = []
  for (const [key, val] of Object.entries(errors)) {
    if (key === 'non_field_errors' || bannerKeys.includes(key)) {
      banner.push(Array.isArray(val) ? val.join(' ') : String(val))
    } else {
      fieldErrors[key] = val
    }
  }
  return { fieldErrors, formError: banner.join(' ') || err?.detail || null }
}
