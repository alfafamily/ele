// Текст ошибки сохранения инлайн-поля (DRF errors/detail → строка).
// Вынесено из inlineFields.jsx отдельным модулем, чтобы тот экспортировал
// только компоненты (не ломает React Fast Refresh).
export const fieldError = (e) =>
  e.errors ? Object.values(e.errors).flat().join(' ') : e.detail || 'Не удалось сохранить.'
