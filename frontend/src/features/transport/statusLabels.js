// Статус закрепления транспорта (проще Оборудования — без рабочих мест/складов).
export const TRANSPORT_STATUS_LABEL = {
  assigned: 'За сотрудником',
  free: 'Свободный',
}

// Индикация ТО переиспользует механику Оборудования (статусы/цвета/иконки —
// общие). ТО для транспорта включено всегда, поэтому строчные индикаторы
// показываем всем, кто причастен к ТО транспорта (см. вызовы).
export {
  MAINTENANCE_STATUS_LABEL,
  MAINTENANCE_STATUS_COLOR,
  planStatusIcon,
  maintenanceIndicators,
} from '../equipment/statusLabels.js'
