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
// options: [{ value, label }] — первый вариант считается «сброшенным» (radio).
// extra (необязательно): дополнительная мультивыбор-секция —
//   { title, options: [{ value, label }], values: string[], onToggle: (value) }.
//   Не закрывает меню при клике (можно отметить несколько).
export function FilterButton({ options, value, onChange, extra, title = 'Фильтры' }) {
  const [open, setOpen] = useState(false)
  const isMobile = useMediaQuery('(max-width: 768px)')
  const ref = useRef(null)
  const resetValue = options[0]?.value
  const extraCount = extra?.values?.length || 0
  const active = value !== resetValue || extraCount > 0
  const badgeCount = (value !== resetValue ? 1 : 0) + extraCount

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
      className="ele-filter-btn__trigger"
      onClick={() => setOpen((o) => !o)}
      aria-haspopup="menu"
      aria-expanded={open}
      aria-label={title}
    >
      <Icon name="sliders-horizontal" size={18} strokeWidth={1.9} />
      <span className="ele-only-desktop">{title}</span>
      {/* Бейдж-счётчик применённых фильтров (основной radio + мультивыбор). */}
      {active ? <span className="ele-filter-btn__badge">{badgeCount}</span> : null}
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
            {extra?.options?.length ? (
              <div style={{ marginTop: 16 }}>
                {extra.title ? <div className="ele-filter-btn__section-title">{extra.title}</div> : null}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {extra.options.map((opt) => {
                    const checked = extra.values.includes(opt.value)
                    return (
                      <Button
                        key={opt.value}
                        variant={checked ? 'primary' : 'secondary'}
                        fullWidth
                        onClick={() => extra.onToggle(opt.value)}
                      >
                        {opt.label}
                      </Button>
                    )
                  })}
                </div>
              </div>
            ) : null}
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
          {extra?.options?.length ? (
            <>
              <div className="ele-filter-btn__divider" />
              {extra.title ? <div className="ele-filter-btn__section-title">{extra.title}</div> : null}
              {extra.options.map((opt) => {
                const checked = extra.values.includes(opt.value)
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={checked}
                    className={'ele-filter-btn__item' + (checked ? ' ele-filter-btn__item--active' : '')}
                    onClick={() => extra.onToggle(opt.value)}
                  >
                    <span className="ele-filter-btn__check ele-filter-btn__check--box">
                      {checked ? <Icon name="check" size={13} strokeWidth={2.6} /> : null}
                    </span>
                    <span>{opt.label}</span>
                  </button>
                )
              })}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
