import { EquipmentIcon, LicensesIcon, PremisesIcon, EmployeesIcon, SimIcon, PassesIcon, SettingsIcon } from './navIcons.jsx'

// Видимость разделов навигации — по матрице доступа (Наблюдатель
// расширяет только видимость объектов Оборудования внутри раздела, не
// видимость самого раздела в навигации — поэтому здесь не участвует).
const SECTIONS = [
  { key: 'equipment', to: '/', label: 'Оборудование', icon: EquipmentIcon, roles: ['admin', 'accountant', 'employee'] },
  { key: 'licenses', to: '/licenses', label: 'Лицензии', icon: LicensesIcon, roles: ['admin', 'accountant'] },
  { key: 'sim', to: '/sim-cards', label: 'Корпоративная связь', icon: SimIcon, roles: ['admin', 'accountant'] },
  { key: 'passes', to: '/passes', label: 'Средства доступа', icon: PassesIcon, roles: ['admin', 'accountant'] },
  { key: 'premises', to: '/premises', label: 'Помещения', icon: PremisesIcon, roles: ['admin', 'accountant'] },
  { key: 'employees', to: '/employees', label: 'Сотрудники', icon: EmployeesIcon, roles: ['admin', 'accountant'] },
  { key: 'settings', to: '/settings', label: 'Настройки', icon: SettingsIcon, roles: ['admin'], bottom: true },
]

export function navSectionsForRole(role) {
  return SECTIONS.filter((s) => s.roles.includes(role))
}
