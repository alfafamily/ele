import { useEffect, useMemo, useState } from 'react'
import { Icon } from '../Icon/Icon.jsx'
import { LeadIconCircle } from '../../LeadIconCircle.jsx'

// Выбор Вида (тип оборудования/транспорта/лицензии) — в стиле выбора места
// (PlaceSelect): пока ничего не выбрано, блок «поиск + список»; как только вид
// выбран — сворачивается в строку выбранного с крестиком (по клику снова
// открываются поиск и список). Список ограничен ~4 строками. Заменяет нативный
// <select>: удобнее при большом числе видов и единообразно с «Размещением».
const LIST_MAX_HEIGHT = 216 // ≈ 4 строки

export function TypeSelect({
  label,
  required = false,
  icon = 'tag',
  options,
  value,
  onChange,
  error,
  placeholder = 'Поиск',
  emptyText = 'Нет доступных видов',
}) {
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState(true)
  const errorText = Array.isArray(error) ? error[0] : error

  // Если вид уже выбран (редактирование) — стартуем свёрнутыми.
  useEffect(() => {
    if (value) setEditing(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selected = (options || []).find((o) => String(o.id) === String(value))
  const collapsed = !editing && Boolean(value)

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (options || []).filter((o) => !q || (o.name || '').toLowerCase().includes(q))
  }, [options, query])

  const choose = (o) => {
    onChange(String(o.id))
    setEditing(false)
  }
  const clear = () => {
    onChange('')
    setQuery('')
    setEditing(true)
  }

  const labelNode =
    label !== null ? (
      <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)', marginBottom: 6 }}>
        {label} {required ? <span style={{ color: 'var(--color-danger, #d9455f)' }}>*</span> : null}
      </div>
    ) : null

  if (collapsed) {
    return (
      <div>
        {labelNode}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', background: 'var(--color-fill-input)', borderRadius: 10 }}>
          <LeadIconCircle name={icon} size={30} iconSize={15} tinted />
          <span style={{ minWidth: 0, flex: 1, fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {selected?.name ?? '…'}
          </span>
          <button type="button" onClick={clear} title="Изменить" aria-label="Изменить" style={{ width: 28, height: 28, flex: 'none', borderRadius: 8, background: 'var(--color-surface)', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'inset 0 0 0 1px var(--color-border)' }}>
            <Icon name="x" size={15} strokeWidth={2} />
          </button>
        </div>
        {errorText ? <div style={{ fontSize: 12, color: 'var(--color-danger, #d9455f)', marginTop: 5 }}>{errorText}</div> : null}
      </div>
    )
  }

  return (
    <div>
      {labelNode}
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%',
          height: 40,
          boxShadow: `inset 0 0 0 1px ${errorText ? 'var(--color-danger, #d9455f)' : 'var(--color-border)'}`,
          borderRadius: 10,
          border: 'none',
          padding: '0 12px',
          fontSize: 13.5,
          fontFamily: 'inherit',
        }}
      />
      {errorText ? <div style={{ fontSize: 12, color: 'var(--color-danger, #d9455f)', marginTop: 5 }}>{errorText}</div> : null}
      <div style={{ marginTop: 8, border: '1px solid var(--color-border)', borderRadius: 10, overflowY: 'auto', maxHeight: LIST_MAX_HEIGHT, padding: 4 }}>
        {list.length === 0 ? (
          <div style={{ padding: 12, fontSize: 13, color: 'var(--color-text-placeholder)', textAlign: 'center' }}>
            {query ? 'Ничего не найдено' : emptyText}
          </div>
        ) : (
          list.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => choose(o)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 11px', border: 'none', borderRadius: 8, background: 'transparent', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}
            >
              <span style={{ minWidth: 0, flex: 1, fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.name}</span>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
