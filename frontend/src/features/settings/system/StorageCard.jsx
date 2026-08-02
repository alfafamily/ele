import { useEffect, useState } from 'react'
import { useRefreshCompany } from '../../../app/CompanyContext'
import { Banner, Button, Card, Spinner } from '../../../shared/ui'
import { InlineField } from '../inlineFields.jsx'
import { fieldError } from '../fieldError.js'
import { getStorageMigrationStatus, retryStorageMigration, testStorage, updateStorageMode, updateCompanySettings } from '../settingsApi.js'
import { sectionTitle, sectionHint, checkRow } from './helpers.js'
import { CheckResult, CheckSuccess, SpaceInfo } from './parts.jsx'

// Хранилище приложения: выбор local/S3, перенос файлов при смене режима,
// проверка подключения, свободное место (B33) и лимит размера загрузки.
export function StorageCard({ status, isMobile, initialMigration, initialMaxUploadMb, spaceApp }) {
  const refreshCompany = useRefreshCompany()
  const [storageMode, setStorageMode] = useState(status.storage_mode)
  const [savingStorage, setSavingStorage] = useState(false)
  const [storageTesting, setStorageTesting] = useState(false)
  const [storageResult, setStorageResult] = useState(null) // { ok, msg }
  const [migration, setMigration] = useState(initialMigration) // { status, pending_count, error_count, target_backend }
  const [migrationRetrying, setMigrationRetrying] = useState(false)
  const [maxUploadMb, setMaxUploadMb] = useState(initialMaxUploadMb)

  // Пока идёт перенос файлов — периодически обновляем статус, чтобы поймать
  // завершение и снова разрешить смену режима.
  useEffect(() => {
    if (migration?.status !== 'in_progress') return
    const id = setInterval(() => {
      getStorageMigrationStatus().then(setMigration).catch(() => {})
    }, 4000)
    return () => clearInterval(id)
  }, [migration?.status])

  const onStorageMode = async (mode) => {
    // S3 без параметров в .env — переключение не выполняется, радио остаётся на
    // локальном (storageMode не меняем), показываем ошибку.
    if (mode === 's3' && !status.s3_configured) {
      setStorageResult({ ok: false, msg: 'Параметры S3 не заданы в .env, использование S3 невозможно.' })
      return
    }
    setSavingStorage(true)
    setStorageResult(null)
    try {
      await updateStorageMode(mode)
      setStorageMode(mode)
      // Смена режима запускает перенос уже загруженных файлов — сразу
      // подтягиваем статус, чтобы заблокировать повторную смену.
      getStorageMigrationStatus().then(setMigration).catch(() => {})
    } catch (err) {
      setStorageResult({ ok: false, msg: err.detail || 'Не удалось сменить режим хранилища.' })
    } finally {
      setSavingStorage(false)
    }
  }

  const retryMigration = async () => {
    setMigrationRetrying(true)
    try {
      await retryStorageMigration()
      setMigration(await getStorageMigrationStatus())
    } catch {
      // статус обновится следующим опросом
    } finally {
      setMigrationRetrying(false)
    }
  }

  const runStorageTest = async () => {
    setStorageTesting(true)
    setStorageResult(null)
    try {
      const data = await testStorage()
      setStorageResult({ ok: true, msg: data.detail })
    } catch (err) {
      setStorageResult({ ok: false, msg: err.detail || 'Проверка не пройдена.' })
    } finally {
      setStorageTesting(false)
    }
  }

  const saveMaxUpload = async (val) => {
    const n = parseInt(val, 10)
    if (!Number.isFinite(n) || n < 1) return 'Укажите целое число не меньше 1.'
    try {
      const u = await updateCompanySettings({ max_upload_mb: n })
      setMaxUploadMb(u.max_upload_mb)
      // Обновляем CompanyContext — зоны загрузки во всём приложении берут лимит оттуда.
      refreshCompany?.()
    } catch (err) {
      return fieldError(err)
    }
  }

  return (
    <Card style={{ flex: 1, minWidth: 0 }}>
      <div style={sectionTitle}>Хранилище приложения</div>
      <div style={sectionHint}>Выберите где будут хранятся загруженные файлы.</div>
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 10 : 24 }}>
        {[
          { value: 'local', label: 'Локальное хранилище' },
          { value: 's3', label: 'S3' },
        ].map((opt) => {
          const busy = savingStorage || migration?.status === 'in_progress'
          // S3 без параметров в .env — опция «выключена» (приглушена, курсор
          // not-allowed), но клик по ней всё равно показывает ошибку.
          const blocked = opt.value === 's3' && !status.s3_configured
          return (
            <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: busy ? 'default' : blocked ? 'not-allowed' : 'pointer', fontSize: 14, opacity: blocked || (busy && storageMode !== opt.value) ? 0.55 : 1 }}>
              <input type="radio" name="storage-mode" checked={storageMode === opt.value} disabled={busy} onChange={() => onStorageMode(opt.value)} />
              {opt.label}
            </label>
          )
        })}
      </div>

      {/* Перенос файлов между хранилищами — идёт в фоне (cron). Пока
          не завершён, смена режима заблокирована выше. */}
      {migration && migration.status === 'in_progress' ? (
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--color-text-muted)' }}>
          <Spinner size={14} />
          Идёт перенос файлов в «{migration.target_backend === 's3' ? 'S3' : 'Локальное хранилище'}»: осталось {migration.pending_count}. Смена режима недоступна до завершения.
        </div>
      ) : migration && migration.status === 'error' ? (
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Banner variant="error">Не удалось перенести файлов: {migration.error_count}.</Banner>
          <Button type="button" variant="secondary" loading={migrationRetrying} onClick={retryMigration}>
            Повторить перенос
          </Button>
        </div>
      ) : null}

      {storageMode === 's3' && status.s3_bucket ? (
        <div style={{ fontSize: 12.5, color: 'var(--color-text-placeholder)', marginTop: 12 }}>
          Бакет S3: <b style={{ color: 'var(--color-text-muted)' }}>{status.s3_bucket}</b>
        </div>
      ) : null}

      {/* B33: свободное место хранилища приложения */}
      {spaceApp ? <SpaceInfo info={spaceApp} /> : null}

      <div style={{ ...checkRow, marginTop: 12 }}>
        {storageResult?.ok ? (
          <CheckSuccess />
        ) : (
          <>
            <Button type="button" variant="secondary" loading={storageTesting} onClick={runStorageTest}>
              Проверить подключение
            </Button>
            {storageResult && !storageResult.ok ? <CheckResult result={storageResult} /> : null}
          </>
        )}
      </div>

      {/* Настраиваемый лимит размера загружаемого файла (реквизиты, план
          помещения). Аватары и лого — свой фиксированный лимит. */}
      <div style={{ marginTop: 20, borderTop: '1px solid var(--color-border)', paddingTop: 16 }}>
        <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)', marginBottom: 10 }}>
          Ограничение размера одного загружаемого файла. Не распространяется на аватары и логотип.
        </div>
        <InlineField
          label="Максимальный размер файла (МБ)"
          value={String(maxUploadMb)}
          placeholder="20"
          onSave={saveMaxUpload}
        />
      </div>
    </Card>
  )
}
