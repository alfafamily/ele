// Левая (информационная) часть строки SIM — общая для карточки Сотрудника и
// Профиля. Показывается только за сотрудником (значит, всегда активна), поэтому
// плашки статуса нет — только плашка типа (SIM/E-SIM) · Номер.
export function SimCardInfo({ sim }) {
  const meta = [
    sim.network_operator && `Оператор: ${sim.network_operator}`,
    sim.provider && `Поставщик: ${sim.provider}`,
  ]
    .filter(Boolean)
    .join(' · ')
  const badgeStyle = {
    fontSize: 11,
    fontWeight: 700,
    color: '#fff',
    background: 'var(--color-text-primary)',
    padding: '1px 7px',
    borderRadius: 5,
    whiteSpace: 'nowrap',
  }
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={badgeStyle}>{sim.sim_type_display}</span>
        <span style={{ font: '600 13.5px var(--font-mono)', color: 'var(--color-text-primary)' }}>{sim.phone_number}</span>
      </div>
      {meta ? <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)', marginTop: 3 }}>{meta}</div> : null}
    </div>
  )
}
