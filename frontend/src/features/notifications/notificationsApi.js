// B44. API раздела «Уведомления»: настройки каналов + Web Push-подписки.
import { apiGet, apiPatch, apiPost } from '../../shared/api/client.js'

export const getPreferences = () => apiGet('/api/notifications/preferences/')
export const patchPreference = (body) => apiPatch('/api/notifications/preferences/', body)
export const getVapidKey = () => apiGet('/api/notifications/push/vapid-key/')
export const subscribePush = (subscription) => apiPost('/api/notifications/push/subscribe/', subscription)
export const unsubscribePush = (endpoint) => apiPost('/api/notifications/push/unsubscribe/', { endpoint })
