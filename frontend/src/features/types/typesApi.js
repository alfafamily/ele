import { apiDelete, apiGet, apiPatch, apiPost } from '../../shared/api/client'

// Общий клиент для equipment-types/license-types — оба ViewSet'а без
// pagination_class (обычный массив) и с одинаковой формой fields/impact
// вложенных эндпоинтов .
export function makeTypesApi(domain) {
  const base = `/api/${domain}-types/`
  return {
    listTypes: () => apiGet(base),
    // accountingType — только для Типов оборудования (у лицензий не передаётся).
    createType: (name, accountingType) =>
      apiPost(base, accountingType ? { name, accounting_type: accountingType } : { name }),
    updateType: (id, payload) => apiPatch(`${base}${id}/`, payload),
    deleteType: (id) => apiDelete(`${base}${id}/`),
    createField: (typeId, payload) => apiPost(`${base}${typeId}/fields/`, payload),
    updateField: (typeId, fieldId, payload) => apiPatch(`${base}${typeId}/fields/${fieldId}/`, payload),
    deleteField: (typeId, fieldId) => apiDelete(`${base}${typeId}/fields/${fieldId}/`),
    getFieldImpact: (typeId, fieldId) => apiGet(`${base}${typeId}/fields/${fieldId}/impact/`),
  }
}
