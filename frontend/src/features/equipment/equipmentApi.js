import { apiDelete, apiGet, apiPatch, apiPost } from '../../shared/api/client'

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
// Размещение (B8): mode=mobile — за сотрудником; mode=stationary — на рабочем
// месте (placeId — место типа workplace).
export const assignEquipment = (id, { mode, employeeId, placeId, comment }) =>
  apiPost(`/api/equipment/${id}/assign/`, {
    mode,
    ...(mode === 'stationary' ? { place: placeId } : { employee: employeeId }),
    ...(comment ? { comment } : {}),
  })
// Открепление на склад (placeId — место типа storage, обязателен).
export const unassignEquipment = (id, placeId, comment) =>
  apiPost(`/api/equipment/${id}/unassign/`, { place: placeId, ...(comment ? { comment } : {}) })
// B13+. Провести ТО по регламенту (regulation=null — внеплановое): дата
// следующего ТО (для периодического), позиции (в т.ч. отменённые) и комментарий.
export const performMaintenance = (id, { regulation, nextDate, comment, items }) =>
  apiPost(`/api/equipment/${id}/maintenance/`, {
    regulation: regulation ?? null,
    ...(nextDate ? { next_planned_date: nextDate } : {}),
    ...(comment ? { comment } : {}),
    items: items || [],
  })

// B13+. Регламенты ТО конкретного оборудования (типовые + индивидуальные) с планами.
export const getEquipmentRegulations = (id) => apiGet(`/api/equipment/${id}/regulations/`)
export const createEquipmentRegulation = (id, payload) => apiPost(`/api/equipment/${id}/regulations/`, payload)
export const updateEquipmentRegulation = (id, regId, payload) =>
  apiPatch(`/api/equipment/${id}/regulations/${regId}/`, payload)
export const archiveEquipmentRegulation = (id, regId) => apiDelete(`/api/equipment/${id}/regulations/${regId}/`)
export const restoreEquipmentRegulation = (id, regId) =>
  apiPatch(`/api/equipment/${id}/regulations/${regId}/`, { is_archived: false })
// Per-equipment операции над планом: отмена/возврат для экземпляра и дата ТО.
export const setRegulationCancelled = (id, regId, isCancelled) =>
  apiPatch(`/api/equipment/${id}/regulations/${regId}/plan/`, { is_cancelled: isCancelled })
export const setRegulationDate = (id, regId, date) =>
  apiPatch(`/api/equipment/${id}/regulations/${regId}/plan/`, { next_planned_date: date })
export const getEquipmentHistoryPath = (id) => `/api/equipment/${id}/history/`
export const uploadEquipmentFieldFile = (id, fieldId) => `/api/equipment/${id}/field-values/${fieldId}/file/`
// Удаление одного из нескольких файлов реквизита (allow_multiple) по id файла.
export const deleteEquipmentFieldFilePath = (id, fieldId, fileId) =>
  `/api/equipment/${id}/field-values/${fieldId}/files/${fileId}/`
