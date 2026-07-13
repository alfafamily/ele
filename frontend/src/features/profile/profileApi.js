import { apiPost } from '../../shared/api/client'

export const changePassword = (payload) => apiPost('/api/auth/change-password/', payload)
export const requestEmailChange = (newEmail) => apiPost('/api/auth/change-email/', { new_email: newEmail })
export const confirmEmailChange = (token) => apiPost('/api/auth/change-email/confirm/', { token })
