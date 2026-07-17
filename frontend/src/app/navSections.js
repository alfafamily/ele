import { EquipmentIcon, LicensesIcon, PremisesIcon, EmployeesIcon, SimIcon, PassesIcon, SettingsIcon } from './navIcons.jsx'

// Видимость разделов навигации — по матрице доступа.
// - Наблюдатель (employee + is_observer) видит все бизнес-разделы (observer:true)
//   на просмотр — но не «Настройки» и не редактор Типов.
// - Обычный «Сотрудник» (без признака) бизнес-разделов не видит вовсе — ему
//   доступны только Профиль и Руководство (нижний таб-бар / rail).
const SECTIONS = [
  { key: 'equipment', to: '/', label: 'Оборудование', icon: EquipmentIcon, roles: ['admin', 'accountant'], observer: true },
  { key: 'licenses', to: '/licenses', label: 'Лицензии', icon: LicensesIcon, roles: ['admin', 'accountant'], observer: true },
  { key: 'sim', to: '/sim-cards', label: 'Корпоративная связь', icon: SimIcon, roles: ['admin', 'accountant'], observer: true },
  { key: 'passes', to: '/passes', label: 'Средства доступа', icon: PassesIcon, roles: ['admin', 'accountant'], observer: true },
  { key: 'premises', to: '/premises', label: 'Помещения', icon: PremisesIcon, roles: ['admin', 'accountant'], observer: true },
  { key: 'employees', to: '/employees', label: 'Сотрудники', icon: EmployeesIcon, roles: ['admin', 'accountant'], observer: true },
  { key: 'settings', to: '/settings', label: 'Настройки', icon: SettingsIcon, roles: ['admin'], bottom: true },
]

export function navSectionsForRole(role, isObserver = false) {
  return SECTIONS.filter((s) => s.roles.includes(role) || (isObserver && s.observer))
}
