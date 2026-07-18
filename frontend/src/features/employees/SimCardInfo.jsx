// Левая (информационная) часть строки SIM — общая для карточки Сотрудника и
// Профиля. Показывается только за сотрудником (значит, всегда активна), поэтому
// плашки статуса нет. Тип (SIM/E-SIM) — текстом на второй строке перед
// оператором и поставщиком (плашки типа убраны).
export function SimCardInfo({ sim }) {
  // Если указан хоть один — показываем указанные; если оба пусты — единый
  // текст «без поставщика и оператора».
  const details =
    [
      sim.network_operator && `Оператор: ${sim.network_operator}`,
      sim.provider && `Поставщик: ${sim.provider}`,
    ]
      .filter(Boolean)
      .join(' · ') || 'без поставщика и оператора'
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ font: '600 13.5px var(--font-mono)', color: 'var(--color-text-primary)' }}>{sim.phone_number}</div>
      <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)', marginTop: 3 }}>
        {`${sim.sim_type_display} · ${details}`}
      </div>
    </div>
  )
}
