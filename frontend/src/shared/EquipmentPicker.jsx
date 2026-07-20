import { useEffect, useState } from 'react'
import { apiGet } from './api/client'
import { useDebouncedValue } from './hooks/useDebouncedValue'
import { Icon } from './ui/Icon/Icon.jsx'

// Подбор Оборудования с поиском (например, для установки SIM в модем). Ищет
// среди активного (не списанного) оборудования по учётному номеру/типу/модели.
// onSelect(equipment) — выбранная единица.
export function EquipmentPicker({ onSelect, autoFocus }) {
  const [query, setQuery] = useState('')
  const debounced = useDebouncedValue(query, 250)
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const qs = debounced ? `&search=${encodeURIComponent(debounced)}` : ''
    apiGet(`/api/equipment/?tab=active${qs}`)
      .then((data) => {
        if (!cancelled) setResults(data.results || [])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [debounced])

  return (
    <div>
      <div
        style={{
          height: 40,
          background: 'var(--color-surface)',
          boxShadow: 'inset 0 0 0 1px var(--color-primary)',
          borderRadius: 10,
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          padding: '0 12px',
        }}
      >
        <Icon name="search" size={16} style={{ color: '#757784' }} />
        <input
          autoFocus={autoFocus}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск оборудования"
          style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 13.5, fontFamily: 'inherit' }}
        />
      </div>
      {loading && results.length === 0 ? (
        <div style={{ marginTop: 8, padding: 14, fontSize: 13, textAlign: 'center', color: 'var(--color-text-placeholder)' }}>Загрузка…</div>
      ) : results.length === 0 ? (
        <div style={{ marginTop: 8, padding: 14, fontSize: 13, textAlign: 'center', color: 'var(--color-text-placeholder)' }}>Ничего не найдено</div>
      ) : (
        <div style={{ marginTop: 8, border: '1px solid var(--color-border)', borderRadius: 10, overflow: 'hidden', maxHeight: 216, overflowY: 'auto' }}>
          {results.map((eq) => (
            <button
              key={eq.id}
              type="button"
              onClick={() => onSelect(eq)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '10px 12px',
                background: 'none',
                border: 'none',
                borderBottom: '1px solid var(--color-border-hairline)',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>{eq.type_and_model}</div>
              <div style={{ font: '500 12px var(--font-mono)', color: 'var(--color-text-placeholder)' }}>{eq.inventory_number}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
