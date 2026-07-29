import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '../../shared/ui'

// B45: кнопка «Отчёты» с выпадающим списком отчётов. items: [{ label, to }].
// Единый вид выпадашки — как у меню действий (класс ele-action-menu).
export function ReportsMenu({ items }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="ele-action-menu" ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600,
          background: 'var(--color-surface)', color: 'var(--color-text-secondary)', borderRadius: 'var(--radius-control)',
          padding: '0 16px', boxShadow: 'inset 0 0 0 1px var(--color-border)', border: 'none',
          fontFamily: 'inherit', cursor: 'pointer', height: 'var(--control-height)',
        }}
      >
        <Icon name="chart-column" size={17} strokeWidth={2} />
        <span className="ele-only-desktop">Отчёты</span>
      </button>
      {open ? (
        <div className="ele-action-menu__list" style={{ right: 0, left: 'auto', minWidth: 240 }} role="menu">
          {items.map((it) => (
            <button
              key={it.to}
              type="button"
              role="menuitem"
              className="ele-action-menu__item"
              onClick={() => {
                setOpen(false)
                navigate(it.to)
              }}
            >
              {it.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
