import { useEffect, useState } from 'react'
import { Icon } from '../../shared/ui'
import { useDebouncedValue } from '../../shared/hooks/useDebouncedValue'
import { getTransportPicker } from './premisesApi.js'

// Подбор Транспорта компании (для закрепления за парковочным местом) — по
// образцу EmployeePicker: поиск + список результатов, клик выбирает объект.
export function TransportPicker({ onSelect, excludeIds, purpose }) {
  const [query, setQuery] = useState('')
  const debounced = useDebouncedValue(query, 250)
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const excludeSet = new Set(excludeIds || [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getTransportPicker(debounced, purpose)
      .then((data) => {
        if (!cancelled) setResults(data)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [debounced, purpose])

  const visible = results.filter((t) => !excludeSet.has(t.id))

  return (
    <div>
      <div
        style={{
          height: 40, background: 'var(--color-surface)', boxShadow: 'inset 0 0 0 1px var(--color-primary)',
          borderRadius: 10, display: 'flex', alignItems: 'center', gap: 9, padding: '0 12px',
        }}
      >
        <Icon name="search" size={16} style={{ color: '#757784' }} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск"
          style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 13.5, fontFamily: 'inherit' }}
        />
      </div>
      {loading && results.length === 0 ? (
        <div style={{ marginTop: 8, padding: 14, fontSize: 13, textAlign: 'center', color: 'var(--color-text-placeholder)' }}>Загрузка…</div>
      ) : visible.length === 0 ? (
        <div style={{ marginTop: 8, padding: 14, fontSize: 13, textAlign: 'center', color: 'var(--color-text-placeholder)' }}>
          Транспорт не найден
        </div>
      ) : (
        <div style={{ marginTop: 8, border: '1px solid var(--color-border)', borderRadius: 10, overflow: 'hidden', maxHeight: 216, overflowY: 'auto' }}>
          {visible.map((t, i) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onSelect(t)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', width: '100%',
                border: 'none', borderTop: i === 0 ? 'none' : '1px solid var(--color-border-hairline)',
                background: 'transparent', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
              }}
            >
              <span style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.type_and_model}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--color-text-placeholder)' }}>
                  {[t.plate, `№ ${t.inventory_number}`].filter(Boolean).join(' · ')}
                </div>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
