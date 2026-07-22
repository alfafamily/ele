export const EQUIPMENT_STATUS_LABEL = {
  assigned: 'За сотрудником',
  stationary: 'На рабочем месте',
  free: 'На складе',
}
export const EQUIPMENT_STATUS_VARIANT = { assigned: 'assigned', stationary: 'assigned', free: 'free' }

// B13+. Статус одного плана ТО (по регламенту). null — не контролируется
// (регламент «по потребности», отменён или ещё нет активных регламентов).
export const MAINTENANCE_STATUS_LABEL = {
  scheduled: 'Запланировано',
  due_soon: 'Подходит дата ТО',
  overdue: 'ТО просрочено',
  not_planned: 'Дата ТО не задана',
}

export const MAINTENANCE_STATUS_COLOR = {
  scheduled: 'var(--color-success)',
  due_soon: 'var(--color-warning)',
  overdue: 'var(--color-error)',
  not_planned: 'var(--color-text-placeholder)',
}

// Иконка одного плана ТО (одиночный гаечный ключ; «дата не задана» — серый).
export function planStatusIcon(status) {
  const color = MAINTENANCE_STATUS_COLOR[status] || 'var(--color-text-muted)'
  return { icon: 'wrench', color, title: MAINTENANCE_STATUS_LABEL[status] || 'ТО' }
}

// B13+. Сводная индикация по экземпляру (maintenance_summary с бэкенда):
// {critical, has_unplanned, enabled} → массив иконок {icon,color,title}.
//  · самый критичный статус (overdue→due_soon→scheduled) — цветной wrench;
//  · есть регламент без даты — дополнительно серый wrench-off (может рядом с 1-3).
export function maintenanceIndicators(summary) {
  if (!summary || !summary.enabled) return []
  const out = []
  if (summary.critical) {
    out.push({
      icon: 'wrench',
      color: MAINTENANCE_STATUS_COLOR[summary.critical],
      title: MAINTENANCE_STATUS_LABEL[summary.critical],
    })
  }
  if (summary.has_unplanned) {
    out.push({ icon: 'wrench', color: MAINTENANCE_STATUS_COLOR.not_planned, title: 'Есть регламент без даты ТО' })
  }
  return out
}

// B23. Иконки ТО в списке оборудования с учётом причастности пользователя к типу.
//  · fullStatus — пользователь проводит ТО по этому типу (в своей области) или
//    Наблюдатель: видит ВСЕ иконки (цветной статус + серый «нет даты»).
//  · manageOnly — управляет регламентами, но НЕ проводит ТО по этому типу: видит
//    только серый «нет даты» (это его зона ответственности — задать дату), без
//    цветных статусов проведения.
//  · иначе — иконок нет.
export function maintenanceRowIndicators(summary, { fullStatus, manageOnly }) {
  if (!summary || !summary.enabled) return []
  if (fullStatus) return maintenanceIndicators(summary)
  if (manageOnly && summary.has_unplanned) {
    return [{ icon: 'wrench', color: MAINTENANCE_STATUS_COLOR.not_planned, title: 'Есть регламент без даты ТО' }]
  }
  return []
}
