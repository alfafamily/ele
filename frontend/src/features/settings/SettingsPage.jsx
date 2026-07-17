import { useEffect, useRef, useState } from 'react'
import { useMediaQuery } from '../../shared/hooks/useMediaQuery.js'
import { Icon } from '../../shared/ui'
import { BackupTab } from './BackupTab.jsx'
import { CompanyTab } from './CompanyTab.jsx'
import { SystemTab } from './SystemTab.jsx'
import { UpdateTab } from './UpdateTab.jsx'
import { UsersTab } from './UsersTab.jsx'
import './SettingsPage.css'

const SECTIONS = [
  { value: 'company', label: 'Компания', Component: CompanyTab },
  { value: 'users', label: 'Пользователи', Component: UsersTab },
  { value: 'system', label: 'Системные', Component: SystemTab },
  { value: 'backup', label: 'Резервное копирование', Component: BackupTab },
  { value: 'update', label: 'Обновление', Component: UpdateTab },
]

// Мобильный селект раздела — белая плашка с названием активного раздела; по
// тапу раскрывается список (как в мобильном «Руководстве»).
function SectionSelect({ sections, value, onChange }) {
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

  const active = sections.find((s) => s.value === value)
  return (
    <div className="ele-settings__select" ref={ref}>
      <button type="button" className="ele-settings__select-trigger" onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open}>
        <span className="ele-settings__select-title">{active?.label}</span>
        <Icon name="chevrons-up-down" size={18} strokeWidth={2} style={{ flex: 'none', color: 'var(--color-text-placeholder)' }} />
      </button>
      {open ? (
        <div className="ele-settings__select-list" role="listbox">
          {sections.map((s) => (
            <button
              key={s.value}
              type="button"
              role="option"
              aria-selected={s.value === value}
              className={'ele-settings__select-item' + (s.value === value ? ' ele-settings__select-item--active' : '')}
              onClick={() => {
                onChange(s.value)
                setOpen(false)
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

// Единый раздел «Настройки», доступен только Администратору (гейт роли — в
// маршруте, см. AppRoutes.jsx). Переключение разделов — как в «Руководстве»:
// боковое меню на десктопе, селект-плашка на мобильном.
export function SettingsPage() {
  const [section, setSection] = useState('company')
  const isMobile = useMediaQuery('(max-width: 768px)')
  const Active = SECTIONS.find((s) => s.value === section)?.Component ?? CompanyTab

  return (
    <div>
      <h1 style={{ fontSize: 'var(--font-size-h1)', fontWeight: 600, letterSpacing: 'var(--font-h1-letter-spacing)', marginBottom: 20 }}>
        Настройки
      </h1>

      {isMobile ? (
        <div>
          <SectionSelect sections={SECTIONS} value={section} onChange={setSection} />
          <div style={{ minWidth: 0, marginTop: 14 }}>
            <Active />
          </div>
        </div>
      ) : (
        <div className="ele-sidebar-layout ele-settings__layout">
          <nav className="ele-settings__nav" aria-label="Разделы настроек">
            {SECTIONS.map((s) => (
              <button
                key={s.value}
                type="button"
                className={'ele-settings__nav-item' + (s.value === section ? ' ele-settings__nav-item--active' : '')}
                onClick={() => setSection(s.value)}
              >
                {s.label}
              </button>
            ))}
          </nav>
          <div className="ele-settings__content" style={{ minWidth: 0 }}>
            <Active />
          </div>
        </div>
      )}
    </div>
  )
}
