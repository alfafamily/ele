import { apiGet, apiPatch, apiPost } from '../../shared/api/client'

// EquipmentTypeViewSet без pagination_class — отдаёт обычный массив, не
// курсорную страницу (Типов на порядки меньше, чем объектов).
export const getEquipmentTypes = () => apiGet('/api/equipment-types/')
export const getEquipment = (id) => apiGet(`/api/equipment/${id}/`)
export const createEquipment = (payload) => apiPost('/api/equipment/', payload)
export const updateEquipment = (id, payload) => apiPatch(`/api/equipment/${id}/`, payload)
export const writeOffEquipment = (id, detachLicenses, comment) =>
  apiPost(`/api/equipment/${id}/write-off/`, {
    ...(detachLicenses ? { detach_licenses: true } : {}),
    ...(comment ? { comment } : {}),
  })
export const assignEmployee = (id, employeeId) => apiPost(`/api/equipment/${id}/assign/`, { employee: employeeId })
export const unassignEmployee = (id) => apiPost(`/api/equipment/${id}/unassign/`)

// Количественный учёт: движения по остатку. quantity — величина операции,
// comment — необязательный комментарий движения.
export const addUnits = (id, quantity, comment) =>
  apiPost(`/api/equipment/${id}/add-units/`, { quantity, ...(comment ? { comment } : {}) })
export const writeOffUnits = (id, quantity, comment) =>
  apiPost(`/api/equipment/${id}/write-off-units/`, { quantity, ...(comment ? { comment } : {}) })
export const assignUnits = (id, employeeId, quantity, comment) =>
  apiPost(`/api/equipment/${id}/assign-units/`, { employee: employeeId, quantity, ...(comment ? { comment } : {}) })
export const unassignUnits = (id, employeeId, quantity, comment) =>
  apiPost(`/api/equipment/${id}/unassign-units/`, { employee: employeeId, quantity, ...(comment ? { comment } : {}) })
export const getEquipmentHistoryPath = (id) => `/api/equipment/${id}/history/`
export const uploadEquipmentFieldFile = (id, fieldId) => `/api/equipment/${id}/field-values/${fieldId}/file/`
// Удаление одного из нескольких файлов реквизита (allow_multiple) по id файла.
export const deleteEquipmentFieldFilePath = (id, fieldId, fileId) =>
  `/api/equipment/${id}/field-values/${fieldId}/files/${fileId}/`
