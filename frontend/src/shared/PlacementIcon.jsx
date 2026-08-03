import { Icon } from './ui'
import { Tooltip } from './Tooltip.jsx'
import { PLACE_TYPE_META } from './placement.js'

// B65. Иконка размещения для колонки списков — без подписи, с тултипом полного
// текста (доступность). Ставится перед названием места/склада.
export function PlacementIcon({ placeType = 'storage', size = 15 }) {
  const meta = PLACE_TYPE_META[placeType] || PLACE_TYPE_META.storage
  return (
    <Tooltip
      label={meta.title}
      role="img"
      aria-label={meta.title}
      style={{ verticalAlign: '-0.15em', marginRight: 6, color: 'var(--color-text-secondary)' }}
    >
      <Icon name={meta.icon} size={size} strokeWidth={2} />
    </Tooltip>
  )
}
