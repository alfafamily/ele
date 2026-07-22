import { apiGet, apiPatch, apiPost, apiRequest } from '../../shared/api/client'

export const getEmployee = (id) => apiGet(`/api/employees/${id}/`)
export const createEmployee = (payload) => apiPost('/api/employees/', payload)
export const updateEmployee = (id, payload) => apiPatch(`/api/employees/${id}/`, payload)
export const terminateEmployee = (id, { deactivateUser, equipmentActions, toolActions, simActions, passActions } = {}) =>
  apiPost(`/api/employees/${id}/terminate/`, {
    ...(deactivateUser ? { deactivate_user: true } : {}),
    ...(equipmentActions ? { equipment_actions: equipmentActions } : {}),
    ...(toolActions ? { tool_actions: toolActions } : {}),
    ...(simActions ? { sim_actions: simActions } : {}),
    ...(passActions ? { pass_actions: passActions } : {}),
  })
export const getDepartments = () => apiGet('/api/employees/departments/')
export const restoreEmployee = (id) => apiPost(`/api/employees/${id}/restore/`, {})
// Архив выданного: завершённые эпизоды владения (объект + даты закрепления/открепления).
export const getEmployeeIssuedArchive = (id) => apiGet(`/api/employees/${id}/issued-archive/`)

// Корпоративные SIM/E-SIM — самостоятельный раздел + привязка из карточки Сотрудника.
export const getSimCard = (id) => apiGet(`/api/sim-cards/${id}/`)
export const createSimCard = (payload) => apiPost('/api/sim-cards/', payload)
export const updateSimCard = (id, payload) => apiPatch(`/api/sim-cards/${id}/`, payload)
export const deleteSimCard = (id) => apiRequest(`/api/sim-cards/${id}/`, { method: 'DELETE' })
export const attachSimCard = (id, employeeId) =>
  apiPost(`/api/sim-cards/${id}/attach/`, { mode: 'employee', employee: employeeId })
export const attachSimToEquipment = (id, equipmentId) =>
  apiPost(`/api/sim-cards/${id}/attach/`, { mode: 'equipment', equipment: equipmentId })
// Открепление на склад (место хранения обязательно, B8).
export const detachSimCard = (id, storagePlaceId) =>
  apiPost(`/api/sim-cards/${id}/detach/`, { storage_place: storagePlaceId })
export const utilizeSimCard = (id, comment) => apiPost(`/api/sim-cards/${id}/utilize/`, comment ? { comment } : {})
export const getSimHistoryPath = (id) => `/api/sim-cards/${id}/history/`
export const getSimOperators = () => apiGet('/api/sim-cards/operators/')
export const getSimProviders = () => apiGet('/api/sim-cards/providers/')

// Пропуска СКУД — самостоятельный раздел + привязка из карточки Сотрудника.
export const getPass = (id) => apiGet(`/api/access-passes/${id}/`)
export const createPass = (payload) => apiPost('/api/access-passes/', payload)
export const updatePass = (id, payload) => apiPatch(`/api/access-passes/${id}/`, payload)
export const deletePass = (id) => apiRequest(`/api/access-passes/${id}/`, { method: 'DELETE' })
export const attachPass = (id, employeeId) => apiPost(`/api/access-passes/${id}/attach/`, { employee: employeeId })
// Открепление на склад (место хранения обязательно, B8).
export const detachPass = (id, storagePlaceId) =>
  apiPost(`/api/access-passes/${id}/detach/`, { storage_place: storagePlaceId })
export const utilizePass = (id, reason, comment) =>
  apiPost(`/api/access-passes/${id}/utilize/`, comment ? { reason, comment } : { reason })
export const getPassHistoryPath = (id) => `/api/access-passes/${id}/history/`
export const uploadEmployeeAvatar = (id, file) => {
  const formData = new FormData()
  formData.append('file', file)
  return apiRequest(`/api/employees/${id}/avatar/`, { method: 'POST', body: formData })
}
export const deleteEmployeeAvatar = (id) => apiRequest(`/api/employees/${id}/avatar/`, { method: 'DELETE' })
