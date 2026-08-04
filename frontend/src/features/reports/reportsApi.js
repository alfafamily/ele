import { apiGet } from '../../shared/api/client'

// Отчёты B45 (только чтение, Администратор/Ответственный за учёт). Фильтры
// применяются на клиенте из полного набора — сервер отдаёт всё. Набор может
// быть большим, поэтому таймаут не применяем (B56-R2), чтобы не оборвать
// легитимно долгий тяжёлый отчёт.
const REPORT_OPTS = { timeout: null }
export const getPlacesReport = (kind) => apiGet(`/api/reports/places/?kind=${kind}`, REPORT_OPTS)
export const getParkingReport = () => apiGet('/api/reports/parking/', REPORT_OPTS)
export const getEmployeesReport = () => apiGet('/api/reports/employees/', REPORT_OPTS)
