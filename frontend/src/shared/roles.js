// Роли — фиксированный enum с бэкенда (accounts.User.Role, ТЗ §2.1), русские
// подписи только для отображения в UI (CLAUDE.md: английские имена в коде).
export const ROLE_LABELS = {
  admin: 'Администратор',
  accountant: 'Ответственный за учёт',
  employee: 'Сотрудник',
}

export function roleLabel(role) {
  return ROLE_LABELS[role] || role
}
