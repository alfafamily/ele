// Один и тот же grid-паттерн колонок повторяется во всех списках спеки
// (-5.3) — columns описывает и заголовок, и разметку строк
// (через gridTemplateColumns), чтобы они не могли разъехаться между собой.
// Вынесено из Table.jsx отдельным модулем, чтобы тот экспортировал только
// компоненты (не ломает React Fast Refresh).
export function gridTemplateColumns(columns) {
  return columns.map((c) => c.width || '1fr').join(' ')
}
