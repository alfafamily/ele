// «раз в N мес.» / «по потребности» — подпись периодичности регламента.
// Вынесено из TypesEditorPage.jsx отдельным модулем, чтобы тот экспортировал
// только компонент (не ломает React Fast Refresh).
export function regulationPeriodLabel(reg) {
  if (reg.on_demand) return 'По потребности'
  const n = reg.period_months
  const d = n % 10
  const h = n % 100
  const word = d === 1 && h !== 11 ? 'месяц' : d >= 2 && d <= 4 && (h < 10 || h >= 20) ? 'месяца' : 'месяцев'
  return `Раз в ${n} ${word}`
}
