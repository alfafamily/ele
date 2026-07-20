import { apiGet, apiPatch, apiPost } from '../../shared/api/client'

// LicenseTypeViewSet тоже без pagination_class — обычный массив (как и
// EquipmentTypeViewSet, см. equipment/equipmentApi.js).
export const getLicenseTypes = () => apiGet('/api/license-types/')
export const getLicense = (id) => apiGet(`/api/licenses/${id}/`)
export const createLicense = (payload) => apiPost('/api/licenses/', payload)
export const updateLicense = (id, payload) => apiPatch(`/api/licenses/${id}/`, payload)
export const utilizeLicense = (id, comment) => apiPost(`/api/licenses/${id}/utilize/`, comment ? { comment } : {})
export const attachLicenseToEquipment = (id, equipmentId) => apiPatch(`/api/licenses/${id}/`, { equipment: equipmentId })
// Отвязка от оборудования. Для аппаратной лицензии можно указать склад
// (место хранения), куда кладётся физический ключ.
export const detachLicenseFromEquipment = (id, storagePlaceId) =>
  apiPatch(`/api/licenses/${id}/`, { equipment: null, ...(storagePlaceId ? { storage_place: storagePlaceId } : {}) })
export const getLicenseHistoryPath = (id) => `/api/licenses/${id}/history/`
export const uploadLicenseFieldFile = (id, fieldId) => `/api/licenses/${id}/field-values/${fieldId}/file/`
// Удаление одного из нескольких файлов реквизита (allow_multiple) по id файла.
export const deleteLicenseFieldFilePath = (id, fieldId, fileId) =>
  `/api/licenses/${id}/field-values/${fieldId}/files/${fileId}/`
