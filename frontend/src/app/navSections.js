import { EquipmentIcon, LicensesIcon, EmployeesIcon, SettingsIcon } from './navIcons.jsx'

// Видимость разделов навигации — по матрице доступа §2.3 (Наблюдатель
// расширяет только видимость объектов Оборудования внутри раздела, не
// видимость самого раздела в навигации — поэтому здесь не участвует).
const SECTIONS = [
  { key: 'equipment', to: '/', label: 'Оборудование', icon: EquipmentIcon, roles: ['admin', 'accountant', 'employee'] },
  { key: 'licenses', to: '/licenses', label: 'Лицензии', icon: LicensesIcon, roles: ['admin', 'accountant'] },
  { key: 'employees', to: '/employees', label: 'Сотрудники', icon: EmployeesIcon, roles: ['admin', 'accountant'] },
  { key: 'settings', to: '/settings', label: 'Настройки', icon: SettingsIcon, roles: ['admin'], bottom: true },
]

export function navSectionsForRole(role) {
  return SECTIONS.filter((s) => s.roles.includes(role))
}
