import { useEffect, useState } from 'react'
import { useMediaQuery } from '../../shared/hooks/useMediaQuery.js'
import { Banner, Spinner } from '../../shared/ui'
import { getBackupSettings, getCompanySettings, getStorageMigrationStatus, getStorageSpace, getSystemStatus } from './settingsApi.js'
import { normalizeIps } from './system/helpers.js'
import { StorageCard } from './system/StorageCard.jsx'
import { BackupDestinationCard } from './system/BackupDestinationCard.jsx'
import { DomainAccessCard } from './system/DomainAccessCard.jsx'
import { AdminAccessCard } from './system/AdminAccessCard.jsx'
import { EmailCheckCard } from './system/EmailCheckCard.jsx'
import { PushCheckCard } from './system/PushCheckCard.jsx'
import { YandexCard } from './system/YandexCard.jsx'
import { CaptchaCard } from './system/CaptchaCard.jsx'

// Системные настройки: оркестратор загружает общие данные (флаги .env, настройки
// компании, статус переноса, назначение бэкапов, свободное место) и раскладывает
// независимые карточки-виджеты — каждая держит собственное локальное состояние.
export function SystemTab() {
  const isMobile = useMediaQuery('(max-width: 768px)')
  const [status, setStatus] = useState(null) // system-status: флаги конфигурации из .env
  const [company, setCompany] = useState(null)
  const [migration, setMigration] = useState(null) // { status, pending_count, error_count, target_backend }
  const [backup, setBackup] = useState(null) // { backup_destination, backup_secondary_s3:{configured,bucket} }
  const [space, setSpace] = useState(null) // B33: { threshold_bytes, app, backup_s3, low }
  const [loadError, setLoadError] = useState(null)

  useEffect(() => {
    Promise.all([getSystemStatus(), getCompanySettings(), getStorageMigrationStatus(), getBackupSettings()])
      .then(([st, comp, mig, bk]) => {
        setStatus(st)
        setCompany(comp)
        setMigration(mig)
        setBackup(bk)
      })
      .catch(() => setLoadError('Не удалось загрузить системные настройки.'))
  }, [])

  // B33: свободное место грузим отдельно — опрос S3 может быть небыстрым, не
  // блокируем им остальные системные настройки. Ошибку тихо игнорируем.
  useEffect(() => {
    getStorageSpace().then(setSpace).catch(() => {})
  }, [])

  if (loadError) return <Banner variant="error">{loadError}</Banner>
  if (!status || !company) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
        <Spinner />
      </div>
    )
  }

  const row = { display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 16, alignItems: 'stretch' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Хранилище приложения (слева) + хранилище резервных копий (справа);
          на мобиле — друг под другом. */}
      <div style={row}>
        <StorageCard
          status={status}
          isMobile={isMobile}
          initialMigration={migration}
          initialMaxUploadMb={company.max_upload_mb ?? 20}
          spaceApp={space?.app}
        />
        <BackupDestinationCard isMobile={isMobile} initialBackup={backup} spaceBackupS3={space?.backup_s3} />
      </div>

      {/* Домен/ограничения входа + доступ к админ-панели — в ряд на десктопе. */}
      <div style={row}>
        <DomainAccessCard
          isMobile={isMobile}
          initialDomain={company.domain || ''}
          initialOpenRegistration={company.open_registration !== false}
          initialIpList={normalizeIps(company.ip_allowlist)}
        />
        <AdminAccessCard
          isMobile={isMobile}
          initialEnabled={company.admin_access_enabled === true}
          initialAdminIps={normalizeIps(company.admin_access_ips)}
        />
      </div>

      {/* Проверка почты (SMTP) слева + проверка Push справа. */}
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 16 }}>
        <EmailCheckCard status={status} />
        <PushCheckCard status={status} />
      </div>

      {/* Проверки Яндекс ID и SmartCaptcha — в ряд на десктопе. */}
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 16 }}>
        <YandexCard status={status} />
        <CaptchaCard status={status} />
      </div>
    </div>
  )
}
