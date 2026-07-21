export const EQUIPMENT_STATUS_LABEL = {
  assigned: 'За сотрудником',
  stationary: 'На рабочем месте',
  free: 'На складе',
}
export const EQUIPMENT_STATUS_VARIANT = { assigned: 'assigned', stationary: 'assigned', free: 'free' }

// B13. Статус ТО (maintenance_status с бэкенда). null — у типа выключено ТО.
export const MAINTENANCE_STATUS_LABEL = {
  scheduled: 'Ближайшее ТО',
  due_soon: 'Подходит дата планируемого ТО',
  overdue: 'ТО просрочено',
  not_planned: 'ТО не запланировано',
}

// Цвет статуса ТО (текст на карточке и цвет пары иконок).
export const MAINTENANCE_STATUS_COLOR = {
  scheduled: 'var(--color-success)',
  due_soon: 'var(--color-warning)',
  overdue: 'var(--color-error)',
  not_planned: 'var(--color-text-placeholder)',
}

// Пара иконок статуса ТО (гаечный ключ + часы) — на карточке и в списке.
//  · просрочено — wrench + clock-4, красные;
//  · подходит   — wrench + clock, жёлтые;
//  · запланировано — wrench + clock-4, зелёные;
//  · не запланировано — wrench-off + clock-fading, серые.
export const MAINTENANCE_STATUS_ICONS = {
  overdue: { icons: ['wrench', 'clock-4'], color: MAINTENANCE_STATUS_COLOR.overdue, title: 'ТО просрочено' },
  due_soon: { icons: ['wrench', 'clock'], color: MAINTENANCE_STATUS_COLOR.due_soon, title: 'Подходит дата ТО' },
  scheduled: { icons: ['wrench', 'clock-4'], color: MAINTENANCE_STATUS_COLOR.scheduled, title: 'Ближайшее ТО' },
  not_planned: { icons: ['wrench-off', 'clock-fading'], color: MAINTENANCE_STATUS_COLOR.not_planned, title: 'ТО не запланировано' },
}
