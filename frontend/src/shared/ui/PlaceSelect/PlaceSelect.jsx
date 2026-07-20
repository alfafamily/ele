import { useEffect, useMemo, useState } from 'react'
import { apiGet } from '../../api/client'
import { Icon } from '../Icon/Icon.jsx'

// Выбор Места нужного типа (B8) — всегда-открытый блок с поиском и списком (не
// выпадающий, чтобы модалка подстраивалась под размер и список не «вылезал»).
// Название Места, под ним «Здание — Помещение», справа — количество (если
// showQuantity). Список ограничен ~4 строками по высоте (дальше — скролл/поиск).
// Сам подгружает активные места (?place_type=storage|workplace).
//   freeMap        — { place_id: qty } остаток по местам (для количества/фильтра);
//   restrictToStock — показывать только места с остатком (freeMap[id] > 0);
//   allowNone      — вариант «Без склада (общий свободный остаток)»;
//   noneQty        — количество для варианта «Без склада» (если showQuantity).
const DEFAULT_LABEL = { storage: 'Место хранения', workplace: 'Рабочее место' }
const LIST_MAX_HEIGHT = 216 // ≈ 4 строки

export function PlaceSelect({
  placeType,
  label,
  value,
  onChange,
  required = false,
  error,
  placeholder,
  freeMap = {},
  restrictToStock = false,
  showQuantity = false,
  allowNone = false,
  noneQty,
}) {
  const [places, setPlaces] = useState(null)
  const [query, setQuery] = useState('')
  const errorText = Array.isArray(error) ? error[0] : error

  useEffect(() => {
    let alive = true
    apiGet(`/api/places/?place_type=${placeType}&active=1`)
      .then((data) => alive && setPlaces(Array.isArray(data) ? data : data.results || []))
      .catch(() => alive && setPlaces([]))
    return () => {
      alive = false
    }
  }, [placeType])

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (places || [])
      .filter((p) => (restrictToStock ? (freeMap[String(p.id)] || 0) > 0 : true))
      .filter((p) =>
        !q ||
        [p.name, p.building_name, p.room_name].some((v) => (v || '').toLowerCase().includes(q)),
      )
  }, [places, query, restrictToStock, freeMap])

  const row = (name, location, qty, selected, onClick) => (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        width: '100%',
        padding: '9px 11px',
        border: 'none',
        borderRadius: 8,
        background: selected ? 'var(--color-info-bg)' : 'transparent',
        cursor: 'pointer',
        textAlign: 'left',
        fontFamily: 'inherit',
      }}
    >
      <span
        style={{
          width: 18,
          height: 18,
          flex: 'none',
          borderRadius: '50%',
          background: selected ? 'var(--color-primary)' : 'transparent',
          boxShadow: selected ? 'none' : 'inset 0 0 0 1.5px var(--color-border-strong)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {selected ? <Icon name="check" size={11} strokeWidth={3} style={{ color: '#fff' }} /> : null}
      </span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
        {location ? (
          <span style={{ display: 'block', fontSize: 11.5, color: 'var(--color-text-placeholder)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{location}</span>
        ) : null}
      </span>
      {showQuantity && typeof qty === 'number' ? (
        <span style={{ fontSize: 13, fontWeight: 600, flex: 'none', color: 'var(--color-text-muted)' }}>{qty} шт.</span>
      ) : null}
    </button>
  )

  return (
    <div>
      {label !== null ? (
        <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)', marginBottom: 6 }}>
          {label ?? DEFAULT_LABEL[placeType]} {required ? <span style={{ color: 'var(--color-danger, #d9455f)' }}>*</span> : null}
        </div>
      ) : null}
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder || 'Поиск места'}
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
        {allowNone
          ? row('Без склада', 'Общий свободный остаток', typeof noneQty === 'number' ? noneQty : undefined, !value, () => onChange(''))
          : null}
        {places === null ? (
          <div style={{ padding: 12, fontSize: 13, color: 'var(--color-text-placeholder)', textAlign: 'center' }}>Загрузка…</div>
        ) : list.length === 0 ? (
          <div style={{ padding: 12, fontSize: 13, color: 'var(--color-text-placeholder)', textAlign: 'center' }}>
            {query ? 'Ничего не найдено' : 'Нет доступных мест'}
          </div>
        ) : (
          list.map((p) =>
            <div key={p.id}>
              {row(p.name, `${p.building_name} — ${p.room_name}`, freeMap[String(p.id)], String(p.id) === String(value), () => onChange(String(p.id)))}
            </div>,
          )
        )}
      </div>
    </div>
  )
}
