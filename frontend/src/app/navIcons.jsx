// Иконки навигации — тонкие обёртки над единым реестром Icon (набор Lucide).
// stroke=currentColor, поэтому активное/неактивное состояние задаётся цветом
// текста в CSS. Толщина 1.7 — визуальный «вес» рейла навигации.
import { Icon } from '../shared/ui/Icon/Icon.jsx'

const nav = (name) => () => <Icon name={name} size={22} strokeWidth={1.7} />

export const EquipmentIcon = nav('tag')
export const LicensesIcon = nav('scroll-text')
export const PremisesIcon = nav('building-2')
export const EmployeesIcon = nav('users')
export const SimIcon = nav('radio-tower')
export const PassesIcon = nav('key-square')
export const SettingsIcon = nav('settings')
export const HelpIcon = nav('library-big')
export const MoreIcon = nav('blocks')
