import { apiDelete, apiGet, apiPatch, apiPost, apiRequest } from '../../shared/api/client'

export const getCompanySettings = () => apiGet('/api/company/settings/')
export const updateCompanySettings = (payload) => apiPatch('/api/company/settings/', payload)
export const uploadCompanyLogo = (file) => {
  const formData = new FormData()
  formData.append('file', file)
  return apiRequest('/api/company/logo/', { method: 'POST', body: formData })
}
export const deleteCompanyLogo = () => apiDelete('/api/company/logo/')
export const getStorageMode = () => apiGet('/api/company/storage-mode/')
export const updateStorageMode = (mode) => apiPatch('/api/company/storage-mode/', { storage_mode: mode })
export const getStorageMigrationStatus = () => apiGet('/api/company/storage-migration-status/')
export const retryStorageMigration = () => apiPost('/api/company/storage-migration-retry/')

export const updateUser = (id, payload) => apiPatch(`/api/users/${id}/`, payload)
export const deactivateUser = (id, terminateEmployee) =>
  apiPost(`/api/users/${id}/deactivate/`, terminateEmployee ? { terminate_employee: true } : {})
export const inviteUser = (payload) => apiPost('/api/users/invite/', payload)

export const getBackupSettings = () => apiGet('/api/company/backup-settings/')
export const updateBackupSettings = (payload) => apiPatch('/api/company/backup-settings/', payload)
export const createBackup = () => apiPost('/api/backup/create/')
export const backupDownloadUrl = (id) => `/api/backup/${id}/download/`
