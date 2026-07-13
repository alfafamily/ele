import { useEffect, useRef, useState } from 'react'
import './ActionMenu.css'

// Кнопка «…» с выпадающим меню действий (мобильные карточки Оборудования/
// Лицензии — Списать/Утилизировать, Редактировать в одном меню вместо
// нескольких кнопок). items: [{ label, onClick, danger }].
export function ActionMenu({ items, label = 'Действия' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

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
    <div className="ele-action-menu" ref={ref}>
      <button type="button" className="ele-action-menu__trigger" onClick={() => setOpen((o) => !o)} aria-label={label} aria-haspopup="menu" aria-expanded={open}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="5" cy="12" r="1.4" />
          <circle cx="12" cy="12" r="1.4" />
          <circle cx="19" cy="12" r="1.4" />
        </svg>
      </button>
      {open ? (
        <div className="ele-action-menu__list" role="menu">
          {items.map((it, i) => (
            <button
              key={i}
              type="button"
              role="menuitem"
              className={'ele-action-menu__item' + (it.danger ? ' ele-action-menu__item--danger' : '')}
              onClick={() => {
                setOpen(false)
                it.onClick()
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
