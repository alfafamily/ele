import { useEffect, useRef, useState } from 'react'
import { useMediaQuery } from '../../hooks/useMediaQuery.js'
import { Button } from '../Button/Button.jsx'
import { Modal } from '../Modal/Modal.jsx'
import './ActionMenu.css'

// Кнопка «…» с меню действий. На desktop — выпадающий список; на мобильных
// (≤768px) — всплывающая снизу модалка «Выберите действие» с пунктами-кнопками
// (единый вид с остальными нижними модалками). items: [{ label, onClick, danger }].
export function ActionMenu({ items, label = 'Действия', title = 'Выберите действие' }) {
  const [open, setOpen] = useState(false)
  const isMobile = useMediaQuery('(max-width: 768px)')
  const ref = useRef(null)

  useEffect(() => {
    if (!open || isMobile) return
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
  }, [open, isMobile])

  const trigger = (
    <button
      type="button"
      className="ele-action-menu__trigger"
      onClick={() => setOpen((o) => !o)}
      aria-label={label}
      aria-haspopup="menu"
      aria-expanded={open}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="5" cy="12" r="1.4" />
        <circle cx="12" cy="12" r="1.4" />
        <circle cx="19" cy="12" r="1.4" />
      </svg>
    </button>
  )

  const runItem = (it) => {
    setOpen(false)
    it.onClick()
  }

  if (isMobile) {
    return (
      <div className="ele-action-menu">
        {trigger}
        {open ? (
          <Modal open onClose={() => setOpen(false)} title={title}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
              {items.map((it, i) => (
                <Button key={i} variant={it.danger ? 'danger' : 'secondary'} fullWidth onClick={() => runItem(it)}>
                  {it.label}
                </Button>
              ))}
            </div>
          </Modal>
        ) : null}
      </div>
    )
  }

  return (
    <div className="ele-action-menu" ref={ref}>
      {trigger}
      {open ? (
        <div className="ele-action-menu__list" role="menu">
          {items.map((it, i) => (
            <button
              key={i}
              type="button"
              role="menuitem"
              className={'ele-action-menu__item' + (it.danger ? ' ele-action-menu__item--danger' : '')}
              onClick={() => runItem(it)}
            >
              {it.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
