import { useEffect, useMemo, useState } from 'react'
import { apiGet } from '../../api/client'
import { Icon } from '../Icon/Icon.jsx'

// Выбор Места нужного типа (B8). Пока ничего не выбрано — блок «поиск + список»
// (не выпадающий, чтобы модалка подстраивалась под размер). Как только место
// выбрано — блок сворачивается в строку выбранного места с крестиком; по клику
// на крестик снова открываются поиск и список. Список ограничен ~4 строками.
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
  // Выбор «Без склада» неотличим от «не выбрано» по value (''), поэтому храним
  // флаг отдельно; блок свёрнут, если выбрано реальное место или «Без склада».
  const [noneChosen, setNoneChosen] = useState(false)
  const [editing, setEditing] = useState(true)
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

  // Если место пришло извне (редактирование) — стартуем свёрнутыми.
  useEffect(() => {
    if (value) setEditing(false)
  }, [])

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (places || [])
      .filter((p) => (restrictToStock ? (freeMap[String(p.id)] || 0) > 0 : true))
      .filter((p) => !q || [p.name, p.building_name, p.room_name].some((v) => (v || '').toLowerCase().includes(q)))
  }, [places, query, restrictToStock, freeMap])

  const selectedPlace = (places || []).find((p) => String(p.id) === String(value))
  const collapsed = !editing && (Boolean(value) || noneChosen)

  const chooseNone = () => {
    onChange('')
    setNoneChosen(true)
    setEditing(false)
  }
  const choosePlace = (p) => {
    onChange(String(p.id))
    setNoneChosen(false)
    setEditing(false)
  }
  const clear = () => {
    onChange('')
    setNoneChosen(false)
    setQuery('')
    setEditing(true)
  }

  const labelNode =
    label !== null ? (
      <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)', marginBottom: 6 }}>
        {label ?? DEFAULT_LABEL[placeType]} {required ? <span style={{ color: 'var(--color-danger, #d9455f)' }}>*</span> : null}
      </div>
    ) : null

  const meta = (name, location, qty) => (
    <span style={{ minWidth: 0, flex: 1 }}>
      <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
      {location ? (
        <span style={{ display: 'block', fontSize: 11.5, color: 'var(--color-text-placeholder)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{location}</span>
      ) : null}
    </span>
  )

  if (collapsed) {
    const name = value ? selectedPlace?.name ?? '…' : 'Без склада'
    const location = value ? (selectedPlace ? `${selectedPlace.building_name} — ${selectedPlace.room_name}` : '') : 'Общий свободный остаток'
    const qty = value ? freeMap[String(value)] : typeof noneQty === 'number' ? noneQty : undefined
    return (
      <div>
        {labelNode}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', background: 'var(--color-fill-input)', borderRadius: 10 }}>
          {meta(name, location, qty)}
          {showQuantity && typeof qty === 'number' ? (
            <span style={{ fontSize: 13, fontWeight: 600, flex: 'none', color: 'var(--color-text-muted)' }}>{qty} шт.</span>
          ) : null}
          <button type="button" onClick={clear} title="Изменить" aria-label="Изменить" style={{ width: 28, height: 28, flex: 'none', borderRadius: 8, background: 'var(--color-surface)', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'inset 0 0 0 1px var(--color-border)' }}>
            <Icon name="x" size={15} strokeWidth={2} />
          </button>
        </div>
        {errorText ? <div style={{ fontSize: 12, color: 'var(--color-danger, #d9455f)', marginTop: 5 }}>{errorText}</div> : null}
      </div>
    )
  }

  const row = (name, location, qty, onClick) => (
    <button
      type="button"
      onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 11px', border: 'none', borderRadius: 8, background: 'transparent', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}
    >
      {meta(name, location, qty)}
      {showQuantity && typeof qty === 'number' ? (
        <span style={{ fontSize: 13, fontWeight: 600, flex: 'none', color: 'var(--color-text-muted)' }}>{qty} шт.</span>
      ) : null}
    </button>
  )

  return (
    <div>
      {labelNode}
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
        {allowNone ? row('Без склада', 'Общий свободный остаток', typeof noneQty === 'number' ? noneQty : undefined, chooseNone) : null}
        {places === null ? (
          <div style={{ padding: 12, fontSize: 13, color: 'var(--color-text-placeholder)', textAlign: 'center' }}>Загрузка…</div>
        ) : list.length === 0 ? (
          <div style={{ padding: 12, fontSize: 13, color: 'var(--color-text-placeholder)', textAlign: 'center' }}>
            {query ? 'Ничего не найдено' : 'Нет доступных мест'}
          </div>
        ) : (
          list.map((p) => (
            <div key={p.id}>{row(p.name, `${p.building_name} — ${p.room_name}`, freeMap[String(p.id)], () => choosePlace(p))}</div>
          ))
        )}
      </div>
    </div>
  )
}
