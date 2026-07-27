import { apiDelete, apiGet, apiPatch, apiPost } from '../../shared/api/client'

// Раздел «Помещения»: справочник зданий/помещений/мест. Удаления нет —
// только архивирование (каскадное вниз), поэтому apiDelete не используется.

// includeArchived подмешивает архивные здания к активным в списке слева.
export const getBuildings = (includeArchived) =>
  apiGet(`/api/buildings/${includeArchived ? '?include_archived=1' : ''}`)

export const createBuilding = (payload) => apiPost('/api/buildings/', payload)
export const updateBuilding = (id, payload) => apiPatch(`/api/buildings/${id}/`, payload)
export const archiveBuilding = (id) => apiPost(`/api/buildings/${id}/archive/`, {})
export const unarchiveBuilding = (id) => apiPost(`/api/buildings/${id}/unarchive/`, {})

export const createRoom = (payload) => apiPost('/api/rooms/', payload)
export const updateRoom = (id, payload) => apiPatch(`/api/rooms/${id}/`, payload)
export const archiveRoom = (id) => apiPost(`/api/rooms/${id}/archive/`, {})
export const unarchiveRoom = (id) => apiPost(`/api/rooms/${id}/unarchive/`, {})
// План парковки (PDF/изображение): загрузка (multipart, поле file) и удаление.
export const uploadRoomPlan = (id, formData) => apiPost(`/api/rooms/${id}/plan/`, formData)
export const deleteRoomPlan = (id) => apiDelete(`/api/rooms/${id}/plan/`)

// Подбор транспорта компании для закрепления за парковочным местом.
export const getTransportPicker = (search) =>
  apiGet(`/api/transport/picker/${search ? `?search=${encodeURIComponent(search)}` : ''}`)

export const createPlace = (payload) => apiPost('/api/places/', payload)
export const updatePlace = (id, payload) => apiPatch(`/api/places/${id}/`, payload)
export const archivePlace = (id) => apiPost(`/api/places/${id}/archive/`, {})
export const unarchivePlace = (id) => apiPost(`/api/places/${id}/unarchive/`, {})
