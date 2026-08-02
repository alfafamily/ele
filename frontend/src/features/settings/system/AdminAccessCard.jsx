import { useState } from 'react'
import { Banner, Card, Checkbox } from '../../../shared/ui'
import { IpAllowlistEditor } from '../IpAllowlistEditor.jsx'
import { fieldError } from '../fieldError.js'
import { updateCompanySettings } from '../settingsApi.js'
import { sectionTitle, normalizeIps } from './helpers.js'

// B9: доступ к служебной Django-админке — глобальный флаг + отдельный IP-список.
export function AdminAccessCard({ isMobile, initialEnabled, initialAdminIps }) {
  const [adminAccessEnabled, setAdminAccessEnabled] = useState(initialEnabled)
  const [adminIps, setAdminIps] = useState(initialAdminIps) // [{ ip, note }]
  const [adminToggleSaving, setAdminToggleSaving] = useState(false)
  const [adminError, setAdminError] = useState(null)

  // Включить можно только при наличии хотя бы одного IP (это же проверяет
  // бэкенд). Выключение снимает права редактирования (is_superuser) у всех —
  // обрабатывается на сервере.
  const toggleAdminAccess = async (val) => {
    setAdminError(null)
    if (val && adminIps.length === 0) {
      setAdminError('Сначала добавьте хотя бы один разрешённый IP-адрес.')
      return
    }
    setAdminToggleSaving(true)
    setAdminAccessEnabled(val) // оптимистично
    try {
      const u = await updateCompanySettings({ admin_access_enabled: val })
      setAdminAccessEnabled(u.admin_access_enabled === true)
    } catch (err) {
      setAdminAccessEnabled(!val)
      setAdminError(fieldError(err))
    } finally {
      setAdminToggleSaving(false)
    }
  }

  const saveAdminIps = async (next) => {
    const u = await updateCompanySettings({ admin_access_ips: next })
    setAdminIps(normalizeIps(u.admin_access_ips))
    setAdminAccessEnabled(u.admin_access_enabled === true)
  }

  return (
    <Card style={{ flex: 1, minWidth: 0 }}>
      <div style={{ ...sectionTitle, marginBottom: 14 }}>Доступ к админ-панели приложения (Django)</div>

      <div>
        <Checkbox
          label="Открыть доступ в админку Django"
          checked={adminAccessEnabled}
          disabled={adminToggleSaving}
          onChange={toggleAdminAccess}
        />
        <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)', marginTop: 2, marginLeft: 30 }}>
          Открывает вход в служебную панель Django по адресу /django_admin с правами только на просмотр. Вход доступен только администраторам и только с разрешённых IP-адресов.
        </div>
      </div>

      {adminError ? (
        <div style={{ marginTop: 12 }}>
          <Banner variant="error">{adminError}</Banner>
        </div>
      ) : null}

      {adminAccessEnabled ? (
        <div style={{ marginTop: 14, fontSize: 12, color: 'var(--color-text-muted)', wordBreak: 'break-all' }}>
          Адрес админ-панели:{' '}
          <span style={{ fontFamily: 'var(--font-mono)' }}>
            {window.location.origin}/django_admin
          </span>
        </div>
      ) : null}

      <div style={{ ...sectionTitle, marginTop: 20, marginBottom: 6, fontSize: 13 }}>Разрешённые IP-адреса</div>
      <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)', marginBottom: 12 }}>
        Нужен минимум один адрес — без него доступ включить нельзя.
      </div>
      <IpAllowlistEditor entries={adminIps} onSave={saveAdminIps} isMobile={isMobile} />
    </Card>
  )
}
