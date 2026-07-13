import { apiGet, apiPatch, apiPost } from '../../shared/api/client'

// EquipmentTypeViewSet без pagination_class — отдаёт обычный массив, не
// курсорную страницу (Типов на порядки меньше, чем объектов, см. §7.1).
export const getEquipmentTypes = () => apiGet('/api/equipment-types/')
export const getEquipment = (id) => apiGet(`/api/equipment/${id}/`)
export const createEquipment = (payload) => apiPost('/api/equipment/', payload)
export const updateEquipment = (id, payload) => apiPatch(`/api/equipment/${id}/`, payload)
export const writeOffEquipment = (id, detachLicenses) =>
  apiPost(`/api/equipment/${id}/write-off/`, detachLicenses ? { detach_licenses: true } : {})
export const assignEmployee = (id, employeeId) => apiPost(`/api/equipment/${id}/assign/`, { employee: employeeId })
export const unassignEmployee = (id) => apiPost(`/api/equipment/${id}/unassign/`)
export const getEquipmentHistoryPath = (id) => `/api/equipment/${id}/history/`
export const uploadEquipmentFieldFile = (id, fieldId) => `/api/equipment/${id}/field-values/${fieldId}/file/`
