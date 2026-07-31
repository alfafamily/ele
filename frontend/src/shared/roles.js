// Роли — фиксированный enum с бэкенда (accounts.User.Role), русские
// подписи только для отображения в UI (английские имена в коде).
const ROLE_LABELS = {
  admin: 'Администратор',
  accountant: 'Ответственный за учёт',
  maintenance: 'Механик по оборудованию',
  automechanic: 'Автомеханик',
  employee: 'Сотрудник',
}

export function roleLabel(role) {
  return ROLE_LABELS[role] || role
}
