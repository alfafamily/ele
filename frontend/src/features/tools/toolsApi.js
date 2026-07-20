import { apiGet, apiPatch, apiPost } from '../../shared/api/client'

export const getTool = (id) => apiGet(`/api/tools/${id}/`)
export const createTool = (payload) => apiPost('/api/tools/', payload)
export const updateTool = (id, payload) => apiPatch(`/api/tools/${id}/`, payload)
export const getToolHistoryPath = (id) => `/api/tools/${id}/history/`

export const writeOffTool = (id, comment) =>
  apiPost(`/api/tools/${id}/write-off/`, comment ? { comment } : {})

// Движения по остатку (B8: остаток лежит на складах). place — склад операции.
export const addUnits = (id, { quantity, place, comment }) =>
  apiPost(`/api/tools/${id}/add-units/`, { quantity, place, ...(comment ? { comment } : {}) })
export const writeOffUnits = (id, { quantity, place, comment }) =>
  apiPost(`/api/tools/${id}/write-off-units/`, { quantity, place, ...(comment ? { comment } : {}) })

// Раздача со склада: mode=mobile — сотруднику; mode=stationary — на рабочее
// место (placeId). fromPlace — склад-источник.
export const assignUnits = (id, { quantity, mode = 'mobile', employeeId, placeId, fromPlace, comment }) =>
  apiPost(`/api/tools/${id}/assign-units/`, {
    quantity,
    mode,
    from_place: fromPlace,
    ...(mode === 'stationary' ? { place: placeId } : { employee: employeeId }),
    ...(comment ? { comment } : {}),
  })

// Возврат на склад (toPlace) от сотрудника (mobile) или рабочего места (stationary).
export const unassignUnits = (id, { quantity, mode = 'mobile', employeeId, placeId, toPlace, comment }) =>
  apiPost(`/api/tools/${id}/unassign-units/`, {
    quantity,
    mode,
    to_place: toPlace,
    ...(mode === 'stationary' ? { place: placeId } : { employee: employeeId }),
    ...(comment ? { comment } : {}),
  })
