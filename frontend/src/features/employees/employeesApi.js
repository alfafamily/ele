import { apiGet, apiPatch, apiPost, apiRequest } from '../../shared/api/client'

export const getEmployee = (id) => apiGet(`/api/employees/${id}/`)
export const createEmployee = (payload) => apiPost('/api/employees/', payload)
export const updateEmployee = (id, payload) => apiPatch(`/api/employees/${id}/`, payload)
export const terminateEmployee = (id, deactivateUser) =>
  apiPost(`/api/employees/${id}/terminate/`, deactivateUser ? { deactivate_user: true } : {})
export const getDepartments = () => apiGet('/api/employees/departments/')

// Корпоративные SIM/E-SIM — работа только из карточки Сотрудника.
export const createSimCard = (payload) => apiPost('/api/sim-cards/', payload)
export const updateSimCard = (id, payload) => apiPatch(`/api/sim-cards/${id}/`, payload)
export const deleteSimCard = (id) => apiRequest(`/api/sim-cards/${id}/`, { method: 'DELETE' })
export const deactivateSimCard = (id) => apiPost(`/api/sim-cards/${id}/deactivate/`, {})
export const getSimOperators = () => apiGet('/api/sim-cards/operators/')
export const getSimProviders = () => apiGet('/api/sim-cards/providers/')

// Пропуска СКУД — работа только из карточки Сотрудника (admin/accountant).
export const createPass = (payload) => apiPost('/api/access-passes/', payload)
export const updatePass = (id, payload) => apiPatch(`/api/access-passes/${id}/`, payload)
export const deactivatePass = (id) => apiPost(`/api/access-passes/${id}/deactivate/`, {})
export const uploadEmployeeAvatar = (id, file) => {
  const formData = new FormData()
  formData.append('file', file)
  return apiRequest(`/api/employees/${id}/avatar/`, { method: 'POST', body: formData })
}
export const deleteEmployeeAvatar = (id) => apiRequest(`/api/employees/${id}/avatar/`, { method: 'DELETE' })
