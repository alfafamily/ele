import { Icon } from './ui'

// B32. Белый кружок-подложка для ведущей иконки строки объекта/рабочего места
// (контраст с серым рядом и белой карточкой; единый вид с аватарами сотрудников).
export function LeadIconCircle({ name, size = 36, iconSize = 18, color, style }) {
  return (
    <span
      style={{
        width: size, height: size, flex: 'none', borderRadius: '50%',
        background: 'var(--color-surface)', border: '1px solid var(--color-border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', ...style,
      }}
    >
      <Icon name={name} size={iconSize} strokeWidth={2} style={{ color: color || 'var(--color-text-muted)' }} />
    </span>
  )
}
