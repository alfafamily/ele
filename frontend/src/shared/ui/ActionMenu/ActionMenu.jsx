import { useEffect, useRef, useState } from 'react'
import { useMediaQuery } from '../../hooks/useMediaQuery.js'
import { Button } from '../Button/Button.jsx'
import { Modal } from '../Modal/Modal.jsx'
import { Icon } from '../Icon/Icon.jsx'
import './ActionMenu.css'

// Кнопка «…» с меню действий. На desktop — выпадающий список; на мобильных
// (≤768px) — всплывающая снизу модалка «Выберите действие» с пунктами-кнопками
// (единый вид с остальными нижними модалками).
// items: [{ label, onClick, danger, disabled, icon }] — icon (имя из набора
// Icon) рисуется слева от подписи; disabled-пункт некликабелен и приглушён.
// note — необязательное примечание под всеми пунктами (напр. почему действие
// недоступно).
export function ActionMenu({ items, note, label = 'Действия', title = 'Выберите действие' }) {
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
      <Icon name="ellipsis" size={20} strokeWidth={2} />
    </button>
  )

  const runItem = (it) => {
    if (it.disabled) return
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
                <Button key={i} variant={it.danger ? 'danger' : 'secondary'} fullWidth disabled={it.disabled} onClick={it.disabled ? undefined : () => runItem(it)}>
                  {it.icon ? <Icon name={it.icon} size={16} style={{ marginRight: 6, verticalAlign: '-3px' }} /> : null}
                  {it.label}
                </Button>
              ))}
            </div>
            {note ? <div className="ele-action-menu__note ele-action-menu__note--mobile">{note}</div> : null}
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
              className={
                'ele-action-menu__item' +
                (it.danger ? ' ele-action-menu__item--danger' : '') +
                (it.disabled ? ' ele-action-menu__item--disabled' : '')
              }
              disabled={it.disabled}
              onClick={it.disabled ? undefined : () => runItem(it)}
            >
              {it.icon ? <Icon name={it.icon} size={15} strokeWidth={1.9} /> : null}
              <span>{it.label}</span>
            </button>
          ))}
          {note ? <div className="ele-action-menu__note">{note}</div> : null}
        </div>
      ) : null}
    </div>
  )
}
