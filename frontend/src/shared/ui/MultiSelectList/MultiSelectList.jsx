import { useMemo, useState } from 'react'
import { Icon } from '../Icon/Icon.jsx'
import '../FilterButton/FilterButton.css'

// Универсальный чек-лист мультивыбора для модалки фильтров (места, операторы,
// поставщики, здания/помещения/места доступа, значения реквизита-списка).
//   options  — [{ value, label, sub? }] (value приводим к строке при сравнении);
//   selected — string[]; onToggle(value) — переключение;
//   search   — показывать ли поле поиска над списком.
export function MultiSelectList({
  options,
  selected,
  onToggle,
  search = false,
  searchPlaceholder = 'Поиск',
  emptyText = 'Ничего не найдено',
  loading = false,
  maxHeight = 216,
}) {
  const [query, setQuery] = useState('')
  const selectedSet = new Set((selected || []).map(String))

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => `${o.label} ${o.sub || ''}`.toLowerCase().includes(q))
  }, [options, query])

  return (
    <div>
      {search ? (
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={searchPlaceholder}
          style={{
            width: '100%',
            height: 40,
            boxShadow: 'inset 0 0 0 1px var(--color-border)',
            borderRadius: 10,
            border: 'none',
            padding: '0 12px',
            fontSize: 13.5,
            fontFamily: 'inherit',
            marginBottom: 8,
          }}
        />
      ) : null}
      <div style={{ border: '1px solid var(--color-border)', borderRadius: 10, overflowY: 'auto', maxHeight, padding: 4 }}>
        {loading ? (
          <div style={{ padding: 12, fontSize: 13, color: 'var(--color-text-placeholder)', textAlign: 'center' }}>Загрузка…</div>
        ) : list.length === 0 ? (
          <div style={{ padding: 12, fontSize: 13, color: 'var(--color-text-placeholder)', textAlign: 'center' }}>{emptyText}</div>
        ) : (
          list.map((o) => {
            const checked = selectedSet.has(String(o.value))
            return (
              <button
                key={o.value}
                type="button"
                role="menuitemcheckbox"
                aria-checked={checked}
                className={'ele-filter-btn__item' + (checked ? ' ele-filter-btn__item--active' : '')}
                style={{ width: '100%' }}
                onClick={() => onToggle(String(o.value))}
              >
                <span className="ele-filter-btn__check ele-filter-btn__check--box">
                  {checked ? <Icon name="check" size={13} strokeWidth={2.6} /> : null}
                </span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.label}</span>
                  {o.sub ? (
                    <span style={{ display: 'block', fontSize: 11.5, fontWeight: 400, color: 'var(--color-text-placeholder)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.sub}</span>
                  ) : null}
                </span>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
