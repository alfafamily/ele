import { Icon } from './ui'
import { Tooltip } from './Tooltip.jsx'

// B32. Статус акцепта закрепления — единый набор иконок (списки, карточки
// объектов, подраздел «Операции закрепления», история). Ключи — и статусы
// объекта (in_absentia/pending/accepted/rejected), и «тоны» истории
// (absentia/pending/accepted/rejected).
const ACCEPTANCE_CFG = {
  in_absentia: { icon: 'circle-check', color: 'var(--color-warning)', label: 'Закреплено заочно' },
  absentia: { icon: 'circle-check', color: 'var(--color-warning)', label: 'Закреплено заочно' },
  pending: { icon: 'clock', color: 'var(--color-text-placeholder)', label: 'Ожидает подтверждения от сотрудника' },
  accepted: { icon: 'circle-check', color: 'var(--color-success)', label: 'Закрепление подтверждено сотрудником' },
  rejected: { icon: 'circle-x', color: 'var(--color-error)', label: 'Сотрудник отклонил закрепление' },
  cancelled: { icon: 'circle-x', color: 'var(--color-error)', label: 'Передача отменена ответственным' },
}

// Иконка статуса. inline=true — выравнивание для потока текста (перед именем
// сотрудника в списках).
export function AcceptanceIcon({ status, size = 15, style, inline = false }) {
  const c = ACCEPTANCE_CFG[status]
  if (!c) return null
  return (
    <Tooltip label={c.label} style={inline ? { verticalAlign: '-3px', marginRight: 5 } : undefined}>
      <Icon name={c.icon} size={size} strokeWidth={2} style={{ color: c.color, flex: 'none', ...style }} />
    </Tooltip>
  )
}

// Иконка статуса поверх правого нижнего угла аватара/иконки объекта (с белым
// кольцом для контраста). Оборачивать в элемент с position: relative.
export function AcceptanceOverlay({ status, size = 15 }) {
  if (!ACCEPTANCE_CFG[status]) return null
  return (
    <span
      style={{
        position: 'absolute', right: -3, bottom: -3, borderRadius: '50%',
        background: 'var(--color-surface)', padding: 1, display: 'flex', lineHeight: 0,
      }}
    >
      <AcceptanceIcon status={status} size={size} />
    </span>
  )
}
