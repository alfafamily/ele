import { useEffect, useRef, useState } from 'react'
import { Icon } from '../Icon/Icon.jsx'
import './SectionSelect.css'

// Селект выбора раздела/вкладки — белая плашка с названием активного пункта; по
// тапу раскрывается список (как в мобильном «Руководстве» и «Настройках»).
// Используется вместо TabBar там, где вкладок мало, но нужен вид выпадающего
// выбора одинаково и на десктопе, и на мобильном. Пункты: { value, label, desc? }.
export function SectionSelect({ options, value, onChange, ariaLabel }) {
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

  const active = options.find((o) => o.value === value)
  return (
    <div className="ele-section-select" ref={ref}>
      <button
        type="button"
        className="ele-section-select__trigger"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
      >
        <span className="ele-section-select__text">
          <span className="ele-section-select__title">{active?.label}</span>
          {active?.desc ? <span className="ele-section-select__desc">{active.desc}</span> : null}
        </span>
        <Icon name="chevrons-up-down" size={18} strokeWidth={2} style={{ flex: 'none', color: 'var(--color-text-placeholder)' }} />
      </button>
      {open ? (
        <div className="ele-section-select__list" role="listbox">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={o.value === value}
              className={'ele-section-select__item' + (o.value === value ? ' ele-section-select__item--active' : '')}
              onClick={() => {
                onChange(o.value)
                setOpen(false)
              }}
            >
              <span className="ele-section-select__title">{o.label}</span>
              {o.desc ? <span className="ele-section-select__desc">{o.desc}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
