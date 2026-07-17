import { apiGet, apiPost } from '../../shared/api/client'

// Свои SIM (read-only). Бэкенд для роли «Сотрудник» отдаёт только его номера
// независимо от переданного employee (Наблюдатель — все) — см. SimCardViewSet.
// Отдаётся курсорная страница — берём results (у сотрудника их единицы).
export const getMySimCards = (employeeId) =>
  apiGet(`/api/sim-cards/?employee=${employeeId}`).then((d) => d.results)

// Свои пропуска (read-only) — бэкенд для роли «Сотрудник» отдаёт только его.
export const getMyPasses = (employeeId) =>
  apiGet(`/api/access-passes/?employee=${employeeId}`).then((d) => d.results)

// Своё закреплённое оборудование (read-only). Для роли «Сотрудник» список и так
// сужен бэкендом до своего; параметр employee — чтобы staff видел именно своё.
export const getMyEquipment = (employeeId) =>
  apiGet(`/api/equipment/?employee=${employeeId}&tab=active`).then((d) => d.results)

export const changePassword = (payload) => apiPost('/api/auth/change-password/', payload)
export const requestEmailChange = (newEmail) => apiPost('/api/auth/change-email/', { new_email: newEmail })
export const confirmEmailChange = (token) => apiPost('/api/auth/change-email/confirm/', { token })
