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

// Иконка-индикатор в списке: только для «скоро» и «просрочено».
export const MAINTENANCE_STATUS_ICON = {
  due_soon: { name: 'clock', color: 'var(--color-warning)', title: 'Подходит дата ТО' },
  overdue: { name: 'triangle-alert', color: 'var(--color-error)', title: 'ТО просрочено' },
}

// Цвет статуса в блоке «Обслуживание» на карточке.
export const MAINTENANCE_STATUS_COLOR = {
  scheduled: 'var(--color-text-muted)',
  due_soon: 'var(--color-warning)',
  overdue: 'var(--color-error)',
  not_planned: 'var(--color-text-placeholder)',
}
