// B27. Утилиты сериализации фильтров в query-параметры useCursorList
// (URLSearchParams.set приводит значение к строке; пустые отбрасываются).

// Значения реквизитов-фильтров (каждое — массив, ИЛИ внутри реквизита) →
// { req_<fieldId>: '["зн1","зн2"]' } (JSON — устойчиво к запятым в тексте).
// Пустые массивы отбрасываются.
export function reqParams(req) {
  const out = {}
  for (const [fieldId, values] of Object.entries(req || {})) {
    if (!Array.isArray(values) || values.length === 0) continue
    out[`req_${fieldId}`] = JSON.stringify(values)
  }
  return out
}

// Массив id → строка «через запятую» (пустой → undefined, чтобы параметр отпал).
export function csvParam(arr) {
  return arr && arr.length ? arr.join(',') : undefined
}
