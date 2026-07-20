import { apiGet, apiPatch, apiPost } from '../../shared/api/client'

export const getTool = (id) => apiGet(`/api/tools/${id}/`)
export const createTool = (payload) => apiPost('/api/tools/', payload)
export const updateTool = (id, payload) => apiPatch(`/api/tools/${id}/`, payload)
export const getToolHistoryPath = (id) => `/api/tools/${id}/history/`

export const writeOffTool = (id, comment) =>
  apiPost(`/api/tools/${id}/write-off/`, comment ? { comment } : {})

// Движения по остатку (B8). Склад (place) необязателен — без него операция идёт
// со свободным остатком без склада (нужно для обновлённых инстансов).
export const addUnits = (id, { quantity, place, comment }) =>
  apiPost(`/api/tools/${id}/add-units/`, { quantity, ...(place ? { place } : {}), ...(comment ? { comment } : {}) })
export const writeOffUnits = (id, { quantity, place, comment }) =>
  apiPost(`/api/tools/${id}/write-off-units/`, { quantity, ...(place ? { place } : {}), ...(comment ? { comment } : {}) })

// Раздача: mode=mobile — сотруднику; mode=stationary — на рабочее место
// (placeId). fromPlace — склад-источник (необязателен).
export const assignUnits = (id, { quantity, mode = 'mobile', employeeId, placeId, fromPlace, comment }) =>
  apiPost(`/api/tools/${id}/assign-units/`, {
    quantity,
    mode,
    ...(fromPlace ? { from_place: fromPlace } : {}),
    ...(mode === 'stationary' ? { place: placeId } : { employee: employeeId }),
    ...(comment ? { comment } : {}),
  })

// Возврат от сотрудника (mobile) или рабочего места (stationary). toPlace —
// склад-приёмник (необязателен: без него возвращается в свободный без склада).
export const unassignUnits = (id, { quantity, mode = 'mobile', employeeId, placeId, toPlace, comment }) =>
  apiPost(`/api/tools/${id}/unassign-units/`, {
    quantity,
    mode,
    ...(toPlace ? { to_place: toPlace } : {}),
    ...(mode === 'stationary' ? { place: placeId } : { employee: employeeId }),
    ...(comment ? { comment } : {}),
  })
