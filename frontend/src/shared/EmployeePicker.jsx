import { useEffect, useState } from 'react'
import { apiGet } from './api/client'
import { nameInitials } from './employeeName'
import { useDebouncedValue } from './hooks/useDebouncedValue'
import { Icon } from './ui/Icon/Icon.jsx'

// Подбор Сотрудника с поиском (C2 «Закрепить сотрудника», форма Оборудования,
// модалка приглашения) — общий для всех мест, где нужен именно Сотрудник
// (не Пользователь).
export function EmployeePicker({ onSelect, autoFocus, inputHeight = 40, excludeIds, withPlus = false, extraParams }) {
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebouncedValue(query, 250)
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const excludeSet = new Set(excludeIds || [])
  // B27: доп. параметры запроса (ограничение опций выбранными фильтрами).
  const extraKey = JSON.stringify(extraParams || {})

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const params = new URLSearchParams()
    if (debouncedQuery) params.set('search', debouncedQuery)
    for (const [k, v] of Object.entries(extraParams || {})) {
      if (v !== undefined && v !== null && v !== '') params.set(k, v)
    }
    const qs = params.toString() ? `?${params.toString()}` : ''
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery, extraKey])

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
        <Icon name="search" size={16} style={{ color: '#757784' }} />
        <input
          autoFocus={autoFocus}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск"
          style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 13.5, fontFamily: 'inherit' }}
        />
      </div>
      {loading && results.length === 0 ? (
        <div style={{ marginTop: 8, padding: 14, fontSize: 13, textAlign: 'center', color: 'var(--color-text-placeholder)' }}>Загрузка…</div>
      ) : results.filter((e) => !excludeSet.has(e.id)).length === 0 ? (
        <div style={{ marginTop: 8, padding: 14, fontSize: 13, textAlign: 'center', color: 'var(--color-text-placeholder)' }}>Никого не найдено</div>
      ) : (
        <div style={{ marginTop: 8, border: '1px solid var(--color-border)', borderRadius: 10, overflow: 'hidden', maxHeight: 216, overflowY: 'auto' }}>
          {results.filter((e) => !excludeSet.has(e.id)).map((emp, i) => (
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
              {withPlus ? (
                <span style={{ flex: 'none', width: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-placeholder)' }}>
                  <Icon name="plus" size={14} strokeWidth={2.4} />
                </span>
              ) : null}
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
                  overflow: 'hidden',
                }}
              >
                {emp.avatar ? (
                  <img src={emp.avatar.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  nameInitials(emp.full_name)
                )}
              </span>
              <span style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{emp.full_name}</div>
                <div style={{ fontSize: 11.5, color: 'var(--color-text-placeholder)' }}>
                  {[emp.position, emp.department].filter(Boolean).join(' · ') || '—'}
                </div>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
