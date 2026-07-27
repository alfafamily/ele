import { apiDelete, apiGet, apiPatch, apiPost } from '../../shared/api/client'

export const getTransportTypes = () => apiGet('/api/transport-types/')
export const getTransport = (id) => apiGet(`/api/transport/${id}/`)
export const createTransport = (payload) => apiPost('/api/transport/', payload)
export const updateTransport = (id, payload) => apiPatch(`/api/transport/${id}/`, payload)
export const writeOffTransport = (id, comment) =>
  apiPost(`/api/transport/${id}/write-off/`, { ...(comment ? { comment } : {}) })
// Закрепление за сотрудником / открепление (→ свободный).
export const assignTransport = (id, employeeId, comment) =>
  apiPost(`/api/transport/${id}/assign/`, { employee: employeeId, ...(comment ? { comment } : {}) })
export const unassignTransport = (id, comment) =>
  apiPost(`/api/transport/${id}/unassign/`, { ...(comment ? { comment } : {}) })
// B22. Провести ТО: регламент (null — внеплановое), дата (для периодического),
// пробег/моточасы (необязательно), позиции и комментарий.
export const performMaintenance = (id, { regulation, nextDate, mileage, comment, items }) =>
  apiPost(`/api/transport/${id}/maintenance/`, {
    regulation: regulation ?? null,
    ...(nextDate ? { next_planned_date: nextDate } : {}),
    ...(mileage != null && mileage !== '' ? { mileage } : {}),
    ...(comment ? { comment } : {}),
    items: items || [],
  })

// B22. Регламенты ТО конкретного транспорта (типовые + индивидуальные) с планами.
export const getTransportRegulations = (id) => apiGet(`/api/transport/${id}/regulations/`)
export const createTransportRegulation = (id, payload) => apiPost(`/api/transport/${id}/regulations/`, payload)
export const updateTransportRegulation = (id, regId, payload) =>
  apiPatch(`/api/transport/${id}/regulations/${regId}/`, payload)
export const archiveTransportRegulation = (id, regId) => apiDelete(`/api/transport/${id}/regulations/${regId}/`)
export const restoreTransportRegulation = (id, regId) =>
  apiPatch(`/api/transport/${id}/regulations/${regId}/`, { is_archived: false })
export const setRegulationCancelled = (id, regId, isCancelled) =>
  apiPatch(`/api/transport/${id}/regulations/${regId}/plan/`, { is_cancelled: isCancelled })
export const setRegulationDate = (id, regId, date) =>
  apiPatch(`/api/transport/${id}/regulations/${regId}/plan/`, { next_planned_date: date })
export const getTransportHistoryPath = (id) => `/api/transport/${id}/history/`
export const uploadTransportFieldFile = (id, fieldId) => `/api/transport/${id}/field-values/${fieldId}/file/`
export const deleteTransportFieldFilePath = (id, fieldId, fileId) =>
  `/api/transport/${id}/field-values/${fieldId}/files/${fileId}/`

// Подпись единицы пробега по mileage_unit типа.
export const mileageUnitLabel = (unit) => (unit === 'motohours' ? 'моточасы' : 'км')
