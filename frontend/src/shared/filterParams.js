// B27. Утилиты сериализации фильтров в query-параметры useCursorList
// (URLSearchParams.set приводит значение к строке; пустые отбрасываются).

// Значения реквизитов-фильтров → { req_<fieldId>: 'значение' }. Булевы —
// 'true'/'false' (бэкенд их распознаёт), остальное — как строка.
export function reqParams(req) {
  const out = {}
  for (const [fieldId, value] of Object.entries(req || {})) {
    if (value === null || value === undefined || value === '') continue
    out[`req_${fieldId}`] = value === true ? 'true' : value === false ? 'false' : String(value)
  }
  return out
}

// Массив id → строка «через запятую» (пустой → undefined, чтобы параметр отпал).
export function csvParam(arr) {
  return arr && arr.length ? arr.join(',') : undefined
}
