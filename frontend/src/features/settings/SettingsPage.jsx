import { useState } from 'react'
import { BackupTab } from './BackupTab.jsx'
import { CompanyTab } from './CompanyTab.jsx'
import { SystemTab } from './SystemTab.jsx'
import { UsersTab } from './UsersTab.jsx'

const TABS = [
  { key: 'company', label: 'Компания' },
  { key: 'users', label: 'Пользователи' },
  { key: 'system', label: 'Системные' },
  { key: 'backup', label: 'Резервное копирование' },
]

// S1-S3 — единый раздел «Настройки» с вкладками (§5.5), доступен только
// Администратору (гейт роли — в маршруте, см. AppRoutes.jsx).
export function SettingsPage() {
  const [tab, setTab] = useState('company')

  return (
    <div>
      <h1 style={{ fontSize: 'var(--font-size-h1)', fontWeight: 600, letterSpacing: 'var(--font-h1-letter-spacing)', marginBottom: 20 }}>
        Настройки
      </h1>
      <div className="ele-sidebar-layout" style={{ gridTemplateColumns: '230px 1fr' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '11px 13px',
                borderRadius: 10,
                border: 'none',
                background: tab === t.key ? 'var(--color-fill-active-tint)' : 'transparent',
                fontWeight: tab === t.key ? 600 : 500,
                fontSize: 14,
                color: tab === t.key ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                textAlign: 'left',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div style={{ minWidth: 0 }}>
          {tab === 'company' ? (
            <CompanyTab />
          ) : tab === 'users' ? (
            <UsersTab />
          ) : tab === 'system' ? (
            <SystemTab />
          ) : (
            <BackupTab />
          )}
        </div>
      </div>
    </div>
  )
}
