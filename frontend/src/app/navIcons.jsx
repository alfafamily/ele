// SVG 1:1 из design/ELE_design_dc.html (icon-rail) — stroke=currentColor,
// чтобы активное/неактивное состояние управлялось только цветом текста в CSS.
const common = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' }

export function EquipmentIcon() {
  return (
    <svg {...common}>
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  )
}

export function LicensesIcon() {
  return (
    <svg {...common}>
      <circle cx="8" cy="8" r="4.2" />
      <path d="M11 11l8 8M17 17l2-2M19 19l2-2" />
    </svg>
  )
}

export function PremisesIcon() {
  return (
    <svg {...common}>
      <path d="M3 21h18M6 21V6l7-3v18M18 21V10l-5-2" />
      <path d="M9 9h.01M9 12h.01M9 15h.01" />
    </svg>
  )
}

export function EmployeesIcon() {
  return (
    <svg {...common}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 20c0-3 2.4-5 5.5-5s5.5 2 5.5 5" />
      <circle cx="17.5" cy="9" r="2.2" />
      <path d="M16 15.4c2.2.2 4 1.9 4 4.6" />
    </svg>
  )
}

export function SettingsIcon() {
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

export function HelpIcon() {
  return (
    <svg {...common} stroke="currentColor">
      <circle cx="12" cy="12" r="10" />
      <path d="M9.2 9.3a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4" />
      <path d="M12 17.4h.01" />
    </svg>
  )
}

export function MoreIcon() {
  // Три точки, вписанные в круг — чтобы по «весу» совпадать с остальными
  // иконками нижней навигации (у трёх точек в ряд без обводки визуальный
  // размер меньше). Точки — залитые, круг — обводкой в цвет текста.
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <circle cx="8" cy="12" r="1.05" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.05" fill="currentColor" stroke="none" />
      <circle cx="16" cy="12" r="1.05" fill="currentColor" stroke="none" />
    </svg>
  )
}
