import { useEffect, useRef, useState } from 'react'
import { apiGet } from '../../api/client'
import { Icon } from '../Icon/Icon.jsx'

// Кастомный селект Места нужного типа (B8): показывает название Места, под ним
// «Здание — Помещение», справа — доступное количество (если showQuantity). Сам
// подгружает активные места (?place_type=storage|workplace). Единый вид для всех
// разделов (размещение оборудования/SIM/пропусков/лицензий/инструментов).
//   freeMap        — { place_id: qty } остаток по местам (для количества/фильтра);
//   restrictToStock — показывать только места с остатком (freeMap[id] > 0);
//   showQuantity   — показывать количество справа;
//   allowNone      — вариант «Без склада (общий свободный остаток)»;
//   noneQty        — количество для варианта «Без склада» (если showQuantity).
const DEFAULT_LABEL = { storage: 'Место хранения', workplace: 'Рабочее место' }

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
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
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

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const list = (places || []).filter((p) => (restrictToStock ? (freeMap[String(p.id)] || 0) > 0 : true))
  const selected = (places || []).find((p) => String(p.id) === String(value))
  const isNone = !value
  const ph = placeholder ?? (places && list.length === 0 ? 'Нет доступных мест' : 'Выберите место')

  const select = (v) => {
    onChange(v)
    setOpen(false)
  }

  const Row = ({ name, location, qty }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, width: '100%' }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
        {location ? (
          <div style={{ fontSize: 11.5, color: 'var(--color-text-placeholder)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{location}</div>
        ) : null}
      </div>
      {showQuantity && typeof qty === 'number' ? (
        <div style={{ fontSize: 13, fontWeight: 600, flex: 'none', color: 'var(--color-text-muted)' }}>{qty} шт.</div>
      ) : null}
    </div>
  )

  const selectedContent = () => {
    if (isNone) {
      if (allowNone) return <Row name="Без склада" location="Общий свободный остаток" qty={typeof noneQty === 'number' ? noneQty : undefined} />
      return <span style={{ color: 'var(--color-text-placeholder)', fontSize: 13.5 }}>{ph}</span>
    }
    if (!selected) return <span style={{ color: 'var(--color-text-placeholder)', fontSize: 13.5 }}>{ph}</span>
    return <Row name={selected.name} location={`${selected.building_name} — ${selected.room_name}`} qty={freeMap[String(selected.id)]} />
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {label !== null ? (
        <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)', marginBottom: 6 }}>
          {label ?? DEFAULT_LABEL[placeType]} {required ? <span style={{ color: 'var(--color-danger, #d9455f)' }}>*</span> : null}
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%',
          minHeight: 46,
          padding: '8px 12px',
          background: 'var(--color-fill-input)',
          border: 'none',
          borderRadius: 10,
          cursor: 'pointer',
          fontFamily: 'inherit',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          textAlign: 'left',
          boxShadow: errorText ? 'inset 0 0 0 1px var(--color-danger, #d9455f)' : 'none',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>{selectedContent()}</div>
        <Icon name="chevrons-up-down" size={16} strokeWidth={2} style={{ flex: 'none', color: 'var(--color-text-placeholder)' }} />
      </button>
      {errorText ? <div style={{ fontSize: 12, color: 'var(--color-danger, #d9455f)', marginTop: 5 }}>{errorText}</div> : null}
      {open ? (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            zIndex: 30,
            background: 'var(--color-surface)',
            borderRadius: 10,
            boxShadow: '0 8px 28px rgba(0,0,0,0.16), inset 0 0 0 1px var(--color-border)',
            maxHeight: 260,
            overflowY: 'auto',
            padding: 4,
          }}
        >
          {allowNone ? (
            <button type="button" onClick={() => select('')} style={optionStyle(isNone)}>
              <Row name="Без склада" location="Общий свободный остаток" qty={typeof noneQty === 'number' ? noneQty : undefined} />
            </button>
          ) : null}
          {places === null ? (
            <div style={{ padding: 12, fontSize: 13, color: 'var(--color-text-placeholder)', textAlign: 'center' }}>Загрузка…</div>
          ) : list.length === 0 ? (
            <div style={{ padding: 12, fontSize: 13, color: 'var(--color-text-placeholder)', textAlign: 'center' }}>Нет доступных мест</div>
          ) : (
            list.map((p) => (
              <button key={p.id} type="button" onClick={() => select(String(p.id))} style={optionStyle(String(p.id) === String(value))}>
                <Row name={p.name} location={`${p.building_name} — ${p.room_name}`} qty={freeMap[String(p.id)]} />
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  )
}

function optionStyle(active) {
  return {
    display: 'flex',
    width: '100%',
    padding: '9px 10px',
    background: active ? 'var(--color-fill-active-tint)' : 'transparent',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    fontFamily: 'inherit',
    textAlign: 'left',
  }
}
