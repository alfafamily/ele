import { apiGet, apiPatch, apiPost, apiRequest } from '../../shared/api/client'

export const getEmployee = (id) => apiGet(`/api/employees/${id}/`)
export const createEmployee = (payload) => apiPost('/api/employees/', payload)
export const updateEmployee = (id, payload) => apiPatch(`/api/employees/${id}/`, payload)
export const terminateEmployee = (id, deactivateUser) =>
  apiPost(`/api/employees/${id}/terminate/`, deactivateUser ? { deactivate_user: true } : {})
export const getDepartments = () => apiGet('/api/employees/departments/')
export const uploadEmployeeAvatar = (id, file) => {
  const formData = new FormData()
  formData.append('file', file)
  return apiRequest(`/api/employees/${id}/avatar/`, { method: 'POST', body: formData })
}
export const deleteEmployeeAvatar = (id) => apiRequest(`/api/employees/${id}/avatar/`, { method: 'DELETE' })
