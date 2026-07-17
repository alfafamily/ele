import { useEffect, useRef, useState } from 'react'
import { useMediaQuery } from '../../hooks/useMediaQuery.js'
import { Button } from '../Button/Button.jsx'
import { Modal } from '../Modal/Modal.jsx'
import { Icon } from '../Icon/Icon.jsx'
import './FilterButton.css'

// Кнопка «Фильтры» рядом с полем поиска: прячет чипы-фильтры списка в
// выпадающее меню (desktop) / нижнюю модалку (mobile). На десктопе показывает
// текст, на мобильном — только иконку. Точка-индикатор появляется, когда выбран
// не первый (сбросовый) вариант — чтобы применённый фильтр был заметен.
// options: [{ value, label }] — первый вариант считается «сброшенным».
export function FilterButton({ options, value, onChange, title = 'Фильтры' }) {
  const [open, setOpen] = useState(false)
  const isMobile = useMediaQuery('(max-width: 768px)')
  const ref = useRef(null)
  const resetValue = options[0]?.value
  const active = value !== resetValue

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

  const pick = (v) => {
    onChange(v)
    setOpen(false)
  }

  const trigger = (
    <button
      type="button"
      className={'ele-filter-btn__trigger' + (active ? ' ele-filter-btn__trigger--active' : '')}
      onClick={() => setOpen((o) => !o)}
      aria-haspopup="menu"
      aria-expanded={open}
      aria-label={title}
    >
      <Icon name="sliders-horizontal" size={18} strokeWidth={1.9} />
      <span className="ele-only-desktop">{title}</span>
      {active ? <span className="ele-filter-btn__dot" /> : null}
    </button>
  )

  if (isMobile) {
    return (
      <div className="ele-filter-btn">
        {trigger}
        {open ? (
          <Modal open onClose={() => setOpen(false)} title={title}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
              {options.map((opt) => (
                <Button
                  key={opt.value}
                  variant={opt.value === value ? 'primary' : 'secondary'}
                  fullWidth
                  onClick={() => pick(opt.value)}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </Modal>
        ) : null}
      </div>
    )
  }

  return (
    <div className="ele-filter-btn" ref={ref}>
      {trigger}
      {open ? (
        <div className="ele-filter-btn__list" role="menu">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="menuitemradio"
              aria-checked={opt.value === value}
              className={'ele-filter-btn__item' + (opt.value === value ? ' ele-filter-btn__item--active' : '')}
              onClick={() => pick(opt.value)}
            >
              <span className="ele-filter-btn__check">
                {opt.value === value ? <Icon name="check" size={15} strokeWidth={2.4} /> : null}
              </span>
              <span>{opt.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
