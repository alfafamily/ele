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

// Свой закреплённый транспорт (read-only) — список сужен бэкендом до своего.
export const getMyTransport = (employeeId) =>
  apiGet(`/api/transport/?employee=${employeeId}&tab=active`).then((d) => d.results)

// Свои Инструменты и Рабочие места (с объектами) — карточка Сотрудника роли
// «Сотрудник» недоступна, поэтому эти блоки берём отдельным эндпоинтом.
export const getMyWorkPlacement = () => apiGet('/api/my/work-placement/')

// B32: закрепления, ожидающие моего решения (акцепт/отказ).
export const getMyPendingAssignments = () => apiGet('/api/assignments/mine/')

// Слепок устройства собирается на клиенте и отправляется вместе с решением —
// используется только если в компании включён сбор слепков (иначе бэкенд его
// игнорирует). navigator.userAgentData доступен не везде — берём что есть.
async function collectDevice() {
  const d = {}
  try { d.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone } catch { /* нет */ }
  try { d.language = navigator.language } catch { /* нет */ }
  try { d.screen = `${window.screen.width}×${window.screen.height}` } catch { /* нет */ }
  try {
    const uad = navigator.userAgentData
    if (uad) {
      d.platform = uad.platform
      const he = await uad.getHighEntropyValues(['platformVersion', 'model'])
      if (he.platformVersion) d.os_version = he.platformVersion
      if (he.model) d.model = he.model
    }
  } catch { /* нет UA-CH */ }
  return d
}

export const acceptAssignment = async (id) =>
  apiPost(`/api/assignments/${id}/accept/`, { device: await collectDevice() })
export const rejectAssignment = async (id) =>
  apiPost(`/api/assignments/${id}/reject/`, { device: await collectDevice() })

export const changePassword = (payload) => apiPost('/api/auth/change-password/', payload)
export const requestEmailChange = (newEmail) => apiPost('/api/auth/change-email/', { new_email: newEmail })
export const confirmEmailChange = (token) => apiPost('/api/auth/change-email/confirm/', { token })
