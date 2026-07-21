import { apiDelete, apiGet, apiPatch, apiPost } from '../../shared/api/client'

// Общий клиент для equipment-types/license-types — оба ViewSet'а без
// pagination_class (обычный массив) и с одинаковой формой fields/impact
// вложенных эндпоинтов .
export function makeTypesApi(domain) {
  const base = `/api/${domain}-types/`
  return {
    listTypes: () => apiGet(base),
    // extra — доменные поля при создании: { allows_sim } (оборудование) или
    // { kind } (лицензии).
    createType: (name, extra = {}) => apiPost(base, { name, ...extra }),
    updateType: (id, payload) => apiPatch(`${base}${id}/`, payload),
    deleteType: (id) => apiDelete(`${base}${id}/`),
    createField: (typeId, payload) => apiPost(`${base}${typeId}/fields/`, payload),
    updateField: (typeId, fieldId, payload) => apiPatch(`${base}${typeId}/fields/${fieldId}/`, payload),
    deleteField: (typeId, fieldId) => apiDelete(`${base}${typeId}/fields/${fieldId}/`),
    getFieldImpact: (typeId, fieldId) => apiGet(`${base}${typeId}/fields/${fieldId}/impact/`),
    // B13+: регламенты ТО типа (только оборудование).
    listRegulations: (typeId) => apiGet(`${base}${typeId}/regulations/`),
    createRegulation: (typeId, payload) => apiPost(`${base}${typeId}/regulations/`, payload),
    updateRegulation: (typeId, regId, payload) => apiPatch(`${base}${typeId}/regulations/${regId}/`, payload),
    archiveRegulation: (typeId, regId, isArchived) =>
      apiPatch(`${base}${typeId}/regulations/${regId}/`, { is_archived: isArchived }),
  }
}
