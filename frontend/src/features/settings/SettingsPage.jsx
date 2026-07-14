import { useState } from 'react'
import { TabBar } from '../../shared/ui'
import { BackupTab } from './BackupTab.jsx'
import { CompanyTab } from './CompanyTab.jsx'
import { SystemTab } from './SystemTab.jsx'
import { UsersTab } from './UsersTab.jsx'

const TABS = [
  { value: 'company', label: 'Компания' },
  { value: 'users', label: 'Пользователи' },
  { value: 'system', label: 'Системные' },
  { value: 'backup', label: 'Резервное копирование' },
]

// S1-S3 — единый раздел «Настройки» с вкладками (§5.5), доступен только
// Администратору (гейт роли — в маршруте, см. AppRoutes.jsx). Переключение
// разделов — тем же TabBar, что «Активные/Архив» в Оборудовании/Лицензиях.
export function SettingsPage() {
  const [tab, setTab] = useState('company')

  return (
    <div>
      <h1 style={{ fontSize: 'var(--font-size-h1)', fontWeight: 600, letterSpacing: 'var(--font-h1-letter-spacing)', marginBottom: 20 }}>
        Настройки
      </h1>
      {/* Горизонтальный скролл — чтобы 4 таба (вкл. длинный «Резервное
          копирование») не ломали ширину на узких экранах. */}
      <div style={{ overflowX: 'auto', marginBottom: 20 }}>
        <TabBar options={TABS} value={tab} onChange={setTab} scroll />
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
  )
}
