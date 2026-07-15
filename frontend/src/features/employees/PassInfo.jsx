// Левая (информационная) часть строки Пропуска — общая для карточки Сотрудника
// и Профиля. Сверху: статус · Учётный номер. Ниже — по строке на каждое здание
// с перечнем помещений (или «все помещения», если для здания ничего не выбрано).
export function PassInfo({ pass }) {
  const buildings = pass.buildings || []
  const rooms = pass.rooms || []
  const badgeStyle = {
    fontSize: 11,
    fontWeight: 700,
    color: '#fff',
    background: pass.is_deactivated ? 'var(--color-text-muted)' : 'var(--color-text-primary)',
    padding: '1px 7px',
    borderRadius: 5,
    whiteSpace: 'nowrap',
  }
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={badgeStyle}>{pass.is_deactivated ? 'Деактивирован' : 'Активен'}</span>
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
