import { Badge } from './ui'

// B32. Короткая нейтральная плашка статуса акцепта закрепления (для списков и
// карточек). Полные формулировки — в контрольном подразделе (status_display).
const SHORT = {
  pending: 'Ожидает подтверждения',
  in_absentia: 'Заочно',
  accepted: 'Подтверждено',
  rejected: 'Отклонено',
}

export function AcceptanceBadge({ status, style }) {
  if (!status || !SHORT[status]) return null
  return <Badge style={style}>{SHORT[status]}</Badge>
}
