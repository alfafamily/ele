import { Card } from '../shared/ui'

// Заглушка бизнес-разделов — сам маршрут и layout (rail/bottom nav) уже
// рабочие (Фаза 7), содержимое экрана появится в Фазе 8.
export function PlaceholderSection({ title }) {
  return (
    <Card style={{ textAlign: 'center', padding: '60px 20px' }}>
      <div style={{ fontSize: 20, fontWeight: 600 }}>{title}</div>
      <div style={{ color: 'var(--color-text-muted)', marginTop: 8 }}>
        Раздел появится в Фазе 8 — сейчас проверяется каркас навигации.
      </div>
    </Card>
  )
}
