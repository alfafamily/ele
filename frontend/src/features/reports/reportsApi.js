import { apiGet } from '../../shared/api/client'

// Отчёты B45 (только чтение, Администратор/Ответственный за учёт). Фильтры
// применяются на клиенте из полного набора — сервер отдаёт всё.
export const getPlacesReport = (kind) => apiGet(`/api/reports/places/?kind=${kind}`)
export const getParkingReport = () => apiGet('/api/reports/parking/')
export const getEmployeesReport = () => apiGet('/api/reports/employees/')
