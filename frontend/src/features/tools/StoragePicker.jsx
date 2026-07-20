import { useEffect, useRef, useState } from 'react'
import { apiGet } from '../../shared/api/client'
import { Icon } from '../../shared/ui'

// Кастомный селект места хранения для операций с инструментом: показывает
// название Места, под ним «Здание — Помещение», справа — доступное количество
// (если showQuantity). Сам подгружает активные склады.
//   freeMap        — { place_id: qty } остаток по складам (для количества/фильтра);
//   restrictToStock — показывать только склады с остатком (freeMap[id] > 0);
//   allowNone      — вариант «Без склада (общий свободный остаток)»;
//   noneQty        — количество для варианта «Без склада» (если showQuantity).
export function StoragePicker({
  label,
  required = false,
  value,
  onChange,
  freeMap = {},
  restrictToStock = false,
  showQuantity = false,
  allowNone = false,
  noneQty,
  placeholder = 'Выберите склад',
}) {
  const [places, setPlaces] = useState(null)
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    apiGet('/api/places/?place_type=storage&active=1')
      .then((data) => setPlaces(Array.isArray(data) ? data : data.results || []))
      .catch(() => setPlaces([]))
  }, [])

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

  const selectedLabel = () => {
    if (isNone) {
      if (allowNone) return <Row name="Без склада" location="Общий свободный остаток" qty={typeof noneQty === 'number' ? noneQty : undefined} />
      return <span style={{ color: 'var(--color-text-placeholder)', fontSize: 13.5 }}>{placeholder}</span>
    }
    if (!selected) return <span style={{ color: 'var(--color-text-placeholder)', fontSize: 13.5 }}>{placeholder}</span>
    return <Row name={selected.name} location={`${selected.building_name} — ${selected.room_name}`} qty={freeMap[String(selected.id)]} />
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {label ? (
        <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)', marginBottom: 6 }}>
          {label} {required ? <span style={{ color: 'var(--color-danger, #d33)' }}>*</span> : null}
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
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>{selectedLabel()}</div>
        <Icon name="chevrons-up-down" size={16} strokeWidth={2} style={{ flex: 'none', color: 'var(--color-text-placeholder)' }} />
      </button>
      {open ? (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            zIndex: 20,
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
            <div style={{ padding: 12, fontSize: 13, color: 'var(--color-text-placeholder)', textAlign: 'center' }}>Нет доступных складов</div>
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
