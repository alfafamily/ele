import { Badge } from '../../shared/ui'
import { KeyTarget } from '../../shared/keyTarget.jsx'

// Левая (информационная) часть строки Пропуска — общая для карточки Сотрудника
// и Профиля. Показывается только за сотрудником (значит, всегда активен),
// поэтому плашки статуса нет. Сверху: Название · Учётный номер. Ниже — плашки
// типа (Авто/Пеший) отдельной строкой, затем по строке на каждое здание с
// перечнем помещений (или «все помещения», если для здания ничего не выбрано).
// Плашки типа — штатный Badge (контрастен к серой подложке блока), не свой
// низкоконтрастный tint.
export function PassInfo({ pass }) {
  const buildings = pass.buildings || []
  const rooms = pass.rooms || []
  const places = pass.places || []
  const isKey = pass.object_type === 'key'
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--color-text-primary)' }}>
          {isKey ? <>Ключ · <KeyTarget pass={pass} /></> : 'Пропуск'}
        </span>
        <span style={{ font: '600 13px var(--font-mono)', color: 'var(--color-text-muted)' }}>
          № {pass.account_number && pass.account_number.trim() ? pass.account_number : 'б/н'}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 5 }}>
        {isKey ? (
          <Badge>Ключ</Badge>
        ) : (
          <>
            {pass.type_vehicle ? <Badge>Авто</Badge> : null}
            {pass.type_pedestrian ? <Badge>Пеший</Badge> : null}
          </>
        )}
      </div>
      {!isKey ? (
        <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {buildings.map((b) => {
            const parts = [
              ...rooms.filter((r) => r.building === b.id).map((r) => r.name),
              ...places.filter((p) => p.building === b.id).map((p) => p.name),
            ]
            const detail = parts.length === 0 ? 'все помещения' : parts.join(', ')
            return (
              <div key={b.id} style={{ fontSize: 12, color: 'var(--color-text-placeholder)' }}>
                <span style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>{b.name}</span> — {detail}
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
