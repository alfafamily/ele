import { useEffect, useMemo, useState } from 'react'
import { getEquipmentTypes } from '../equipment/equipmentApi.js'
import { Checkbox, SearchInput } from '../../shared/ui'

// B23. Блок «Право выполнять ТО по типам оборудования» — общий для модалок
// приглашения и редактирования пользователя. Радио «Все / Некоторые типы»; при
// «Некоторые» — поиск и список типов с включённым ТО (мультивыбор).
// value: { allTypes: boolean, typeIds: number[] }; onChange отдаёт обновлённое.
export function MaintenanceTypeScope({ allTypes, typeIds, onChange }) {
  const [types, setTypes] = useState(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    getEquipmentTypes()
      .then((data) => setTypes(data.filter((t) => t.maintenance_enabled && !t.is_archived)))
      .catch(() => setTypes([]))
  }, [])

  const selected = useMemo(() => new Set((typeIds || []).map(Number)), [typeIds])

  const filtered = useMemo(() => {
    const list = types || []
    const q = search.trim().toLowerCase()
    return q ? list.filter((t) => t.name.toLowerCase().includes(q)) : list
  }, [types, search])

  const toggle = (id) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onChange({ allTypes: false, typeIds: [...next] })
  }

  const radio = (value, label) => (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13.5 }}>
      <input
        type="radio"
        checked={allTypes === value}
        onChange={() => onChange({ allTypes: value, typeIds: value ? [] : typeIds })}
        style={{ accentColor: 'var(--color-primary)', width: 16, height: 16, margin: 0 }}
      />
      {label}
    </label>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)' }}>Право выполнять ТО по типам оборудования</div>
      <div style={{ display: 'flex', gap: 20 }}>
        {radio(true, 'Все типы')}
        {radio(false, 'Некоторые типы')}
      </div>

      {!allTypes ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <SearchInput value={search} onChange={setSearch} placeholder="Поиск по типам" />
          <div
            style={{
              maxHeight: 200,
              overflowY: 'auto',
              border: '1px solid var(--color-border-hairline)',
              borderRadius: 10,
              padding: '4px 0',
            }}
          >
            {types === null ? (
              <div style={{ padding: '10px 14px', fontSize: 13, color: 'var(--color-text-muted)' }}>Загрузка…</div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: '10px 14px', fontSize: 13, color: 'var(--color-text-muted)' }}>
                {types.length === 0 ? 'Нет типов с включённым ТО.' : 'Типы не найдены.'}
              </div>
            ) : (
              filtered.map((t) => (
                <div key={t.id} style={{ padding: '8px 14px' }}>
                  <Checkbox label={t.name} checked={selected.has(Number(t.id))} onChange={() => toggle(Number(t.id))} />
                </div>
              ))
            )}
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)' }}>Выбрано типов: {selected.size}</div>
        </div>
      ) : null}
    </div>
  )
}
