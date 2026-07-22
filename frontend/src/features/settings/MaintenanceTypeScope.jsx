import { useEffect, useMemo, useState } from 'react'
import { getEquipmentTypes } from '../equipment/equipmentApi.js'
import { Icon } from '../../shared/ui'

// B23. Блок «Право выполнять ТО по типам оборудования» — общий для модалок
// приглашения и редактирования пользователя. Радио «Все / Некоторые типы»; при
// «Некоторые» — поиск и список типов с включённым ТО (мультивыбор). Список
// оформлен как в модалке привязки лицензий (AttachLicenseModal): строка поиска +
// рамка-список со строками-квадратными чекбоксами.
// value: { allTypes: boolean, typeIds: number[] }; onChange отдаёт обновлённое.
export function MaintenanceTypeScope({ allTypes, typeIds, onChange }) {
  const [types, setTypes] = useState(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    getEquipmentTypes()
      .then((data) => setTypes(data.filter((t) => t.maintenance_enabled && !t.is_archived)))
      .catch(() => setTypes([]))
  }, [])

  const selected = useMemo(() => new Set((typeIds || []).map(Number)), [typeIds])

  const q = query.trim().toLowerCase()
  const filtered = (types || []).filter((t) => t.name.toLowerCase().includes(q))

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
        types === null ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--color-text-placeholder)' }}>Загрузка…</div>
        ) : types.length === 0 ? (
          <div style={{ padding: 14, fontSize: 13, textAlign: 'center', color: 'var(--color-text-placeholder)' }}>Нет типов с включённым ТО.</div>
        ) : (
          <>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск"
              style={{
                width: '100%',
                height: 42,
                boxShadow: 'inset 0 0 0 1px var(--color-border)',
                borderRadius: 10,
                border: 'none',
                padding: '0 13px',
                fontSize: 13.5,
                fontFamily: 'inherit',
              }}
            />
            {filtered.length === 0 ? (
              <div style={{ padding: 14, fontSize: 13, textAlign: 'center', color: 'var(--color-text-placeholder)' }}>Ничего не найдено</div>
            ) : (
              <div style={{ border: '1px solid var(--color-border)', borderRadius: 12, overflow: 'hidden', maxHeight: 216, overflowY: 'auto' }}>
                {filtered.map((t, i) => {
                  const checked = selected.has(Number(t.id))
                  return (
                    <div
                      key={t.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => toggle(Number(t.id))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          toggle(Number(t.id))
                        }
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 11,
                        width: '100%',
                        padding: '11px 13px',
                        borderTop: i === 0 ? 'none' : '1px solid var(--color-border-hairline)',
                        background: checked ? 'var(--color-info-bg)' : 'transparent',
                        cursor: 'pointer',
                        textAlign: 'left',
                        fontFamily: 'inherit',
                      }}
                    >
                      <span
                        style={{
                          width: 20,
                          height: 20,
                          flex: 'none',
                          borderRadius: 6,
                          background: checked ? 'var(--color-primary)' : 'transparent',
                          boxShadow: checked ? 'none' : 'inset 0 0 0 1.5px var(--color-border-strong)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {checked ? <Icon name="check" size={12} strokeWidth={3} style={{ color: '#fff' }} /> : null}
                      </span>
                      <span style={{ minWidth: 0, flex: 1, fontSize: 13.5, fontWeight: 600 }}>{t.name}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )
      ) : null}
    </div>
  )
}
