import { apiGet, apiPatch, apiPost } from '../../shared/api/client'

export const getTool = (id) => apiGet(`/api/tools/${id}/`)
export const createTool = (payload) => apiPost('/api/tools/', payload)
export const updateTool = (id, payload) => apiPatch(`/api/tools/${id}/`, payload)
export const getToolHistoryPath = (id) => `/api/tools/${id}/history/`

export const writeOffTool = (id, comment) =>
  apiPost(`/api/tools/${id}/write-off/`, comment ? { comment } : {})

// Движения по остатку. quantity — величина операции, comment — необязательный.
export const addUnits = (id, quantity, comment) =>
  apiPost(`/api/tools/${id}/add-units/`, { quantity, ...(comment ? { comment } : {}) })
export const writeOffUnits = (id, quantity, comment) =>
  apiPost(`/api/tools/${id}/write-off-units/`, { quantity, ...(comment ? { comment } : {}) })
export const assignUnits = (id, employeeId, quantity, comment) =>
  apiPost(`/api/tools/${id}/assign-units/`, { employee: employeeId, quantity, ...(comment ? { comment } : {}) })
export const unassignUnits = (id, employeeId, quantity, comment) =>
  apiPost(`/api/tools/${id}/unassign-units/`, { employee: employeeId, quantity, ...(comment ? { comment } : {}) })
