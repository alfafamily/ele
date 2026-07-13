import { useEffect, useState } from 'react'
import { apiGet } from './api/client'
import { useDebouncedValue } from './hooks/useDebouncedValue'

function initials(employee) {
  return `${employee.first_name?.[0] || ''}${employee.last_name?.[0] || ''}`.toUpperCase()
}

// Подбор Сотрудника с поиском (C2 «Закрепить сотрудника», форма Оборудования,
// модалка приглашения) — общий для всех мест, где нужен именно Сотрудник
// (не Пользователь).
export function EmployeePicker({ onSelect, autoFocus, inputHeight = 40 }) {
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebouncedValue(query, 250)
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const qs = debouncedQuery ? `?search=${encodeURIComponent(debouncedQuery)}` : ''
    apiGet(`/api/employees/${qs}`)
      .then((data) => {
        if (!cancelled) setResults(data.results.filter((e) => e.is_employed))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [debouncedQuery])

  return (
    <div>
      <div
        style={{
          height: inputHeight,
          background: 'var(--color-surface)',
          boxShadow: 'inset 0 0 0 1px var(--color-primary)',
          borderRadius: 10,
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          padding: '0 12px',
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#757784" strokeWidth="1.8">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        <input
          autoFocus={autoFocus}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск сотрудника"
          style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 13.5, fontFamily: 'inherit' }}
        />
      </div>
      <div style={{ marginTop: 8, border: '1px solid var(--color-border)', borderRadius: 10, overflow: 'hidden', maxHeight: 260, overflowY: 'auto' }}>
        {loading && results.length === 0 ? (
          <div style={{ padding: 14, fontSize: 13, color: 'var(--color-text-placeholder)' }}>Загрузка…</div>
        ) : results.length === 0 ? (
          <div style={{ padding: 14, fontSize: 13, color: 'var(--color-text-placeholder)' }}>Никого не найдено</div>
        ) : (
          results.map((emp, i) => (
            <button
              key={emp.id}
              type="button"
              onClick={() => onSelect(emp)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '9px 12px',
                width: '100%',
                border: 'none',
                borderTop: i === 0 ? 'none' : '1px solid var(--color-border-hairline)',
                background: 'transparent',
                cursor: 'pointer',
                textAlign: 'left',
                fontFamily: 'inherit',
              }}
            >
              <span
                style={{
                  width: 30,
                  height: 30,
                  flex: 'none',
                  borderRadius: '50%',
                  background: 'var(--color-fill-active-tint)',
                  color: 'var(--color-text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {initials(emp)}
              </span>
              <span style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{emp.full_name}</div>
                <div style={{ fontSize: 11.5, color: 'var(--color-text-placeholder)' }}>
                  {[emp.position, emp.department].filter(Boolean).join(' · ') || '—'}
                </div>
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
