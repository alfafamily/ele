// Левая (информационная) часть строки Пропуска — общая для карточки Сотрудника
// и Профиля. Показывается только за сотрудником (значит, всегда активен),
// поэтому плашки статуса нет. Сверху: плашки типа (Авто/Пеший) · Название. Ниже
// — Учётный номер и по строке на каждое здание с перечнем помещений (или «все
// помещения», если для здания ничего не выбрано).
export function PassInfo({ pass }) {
  const buildings = pass.buildings || []
  const rooms = pass.rooms || []
  const typeBadgeStyle = {
    fontSize: 11,
    fontWeight: 700,
    color: 'var(--color-text-secondary)',
    background: 'var(--color-fill-active-tint)',
    padding: '1px 7px',
    borderRadius: 5,
    whiteSpace: 'nowrap',
  }
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {pass.type_vehicle ? <span style={typeBadgeStyle}>Авто</span> : null}
        {pass.type_pedestrian ? <span style={typeBadgeStyle}>Пеший</span> : null}
        {pass.name ? (
          <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--color-text-primary)' }}>{pass.name}</span>
        ) : null}
        <span style={{ font: '600 13px var(--font-mono)', color: 'var(--color-text-muted)' }}>
          № {pass.account_number && pass.account_number.trim() ? pass.account_number : 'б/н'}
        </span>
      </div>
      <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {buildings.map((b) => {
          const bRooms = rooms.filter((r) => r.building === b.id)
          const roomsText = bRooms.length === 0 ? 'все помещения' : bRooms.map((r) => r.name).join(', ')
          return (
            <div key={b.id} style={{ fontSize: 12, color: 'var(--color-text-placeholder)' }}>
              <span style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>{b.name}</span> — {roomsText}
            </div>
          )
        })}
      </div>
    </div>
  )
}
