import { Icon } from './ui'

// B32. Кружок-подложка для ведущей иконки строки объекта/места. По умолчанию
// серая заливка (на белой подложке блока — контраст с белой карточкой); на
// сером фоне (модалки выбора) — передать tinted для белой заливки с обводкой.
// color — переопределение цвета иконки (напр. статус ТО); по умолчанию контрастный.
export function LeadIconCircle({ name, size = 36, iconSize = 18, color, tinted, style }) {
  return (
    <span
      style={{
        width: size, height: size, flex: 'none', borderRadius: '50%',
        background: tinted ? 'var(--color-surface)' : 'var(--color-fill-active-tint)',
        border: tinted ? '1px solid var(--color-border)' : 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center', ...style,
      }}
    >
      <Icon name={name} size={iconSize} strokeWidth={2} style={{ color: color || 'var(--color-text-secondary)' }} />
    </span>
  )
}
