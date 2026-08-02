import { useState } from 'react'
import { Banner, Button, Card } from '../../../shared/ui'
import { testSecondaryS3, updateBackupSettings } from '../settingsApi.js'
import { sectionTitle, sectionHint, checkRow } from './helpers.js'
import { CheckResult, CheckSuccess, SpaceInfo } from './parts.jsx'

// Хранилище резервных копий — единое назначение ручных и авто-копий (app / S3).
export function BackupDestinationCard({ isMobile, initialBackup, spaceBackupS3 }) {
  const [backup, setBackup] = useState(initialBackup) // { backup_destination, backup_secondary_s3:{configured,bucket} }
  const [savingBackupDest, setSavingBackupDest] = useState(false)
  const [s3Testing, setS3Testing] = useState(false)
  const [s3Result, setS3Result] = useState(null) // { ok, msg }
  const [backupDestError, setBackupDestError] = useState(null)

  // Смена единого назначения резервных копий. Выбор S3 без параметров в .env
  // не выполняется — показываем подсказку, значение не меняем.
  const onBackupDest = async (dest) => {
    setBackupDestError(null)
    if (dest === 'secondary_s3' && !backup?.backup_secondary_s3?.configured) {
      setBackupDestError('Параметры S3 для backup не заданы в .env (BACKUP_S3_*), выбор недоступен.')
      return
    }
    setSavingBackupDest(true)
    setBackup((prev) => ({ ...prev, backup_destination: dest })) // оптимистично
    try {
      const updated = await updateBackupSettings({ backup_destination: dest })
      setBackup((prev) => ({ ...prev, ...updated }))
    } catch (err) {
      setBackup((prev) => ({ ...prev, backup_destination: dest === 'secondary_s3' ? 'own' : prev.backup_destination }))
      setBackupDestError(err.detail || 'Не удалось сохранить назначение резервных копий.')
    } finally {
      setSavingBackupDest(false)
    }
  }

  const runSecondaryS3Test = async () => {
    setS3Testing(true)
    setS3Result(null)
    try {
      const data = await testSecondaryS3()
      setS3Result({ ok: true, msg: data.detail })
    } catch (err) {
      setS3Result({ ok: false, msg: err.detail || 'Проверка не пройдена.' })
    } finally {
      setS3Testing(false)
    }
  }

  return (
    <Card style={{ flex: 1, minWidth: 0 }}>
      <div style={sectionTitle}>Хранилище резервных копий</div>
      <div style={sectionHint}>Выберите куда сохранять резервные копии базы данных и файлов.</div>
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 10 : 24 }}>
        {[
          { value: 'own', label: 'Хранилище приложения' },
          { value: 'secondary_s3', label: 'S3 для backup' },
        ].map((opt) => {
          // S3 без параметров в .env — опция «выключена» (приглушена, курсор
          // not-allowed), но клик по ней всё равно показывает ошибку.
          const blocked = opt.value === 'secondary_s3' && !backup?.backup_secondary_s3?.configured
          const current = backup?.backup_destination || 'own'
          return (
            <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: savingBackupDest ? 'default' : blocked ? 'not-allowed' : 'pointer', fontSize: 14, opacity: blocked ? 0.55 : 1 }}>
              <input type="radio" name="backup-dest" checked={current === opt.value} disabled={savingBackupDest} onChange={() => onBackupDest(opt.value)} />
              {opt.label}
            </label>
          )
        })}
      </div>
      {backupDestError ? (
        <div style={{ marginTop: 10 }}>
          <Banner variant="error">{backupDestError}</Banner>
        </div>
      ) : null}
      {backup?.backup_secondary_s3?.configured ? (
        <>
          <div style={{ fontSize: 12.5, color: 'var(--color-text-placeholder)', marginTop: 14 }}>
            S3 для backup: <b style={{ color: 'var(--color-text-muted)' }}>{backup.backup_secondary_s3.bucket}</b>
          </div>
          {/* B33: свободное место backup-S3 — только когда копии уходят на него
              (при хранении в приложении это дублировало бы блок слева). */}
          {(backup?.backup_destination || 'own') === 'secondary_s3' && spaceBackupS3 ? (
            <SpaceInfo info={spaceBackupS3} />
          ) : null}
          <div style={{ ...checkRow, marginTop: 12 }}>
            {s3Result?.ok ? (
              <CheckSuccess />
            ) : (
              <>
                <Button type="button" variant="secondary" loading={s3Testing} onClick={runSecondaryS3Test}>
                  Проверить подключение
                </Button>
                {s3Result && !s3Result.ok ? <CheckResult result={s3Result} /> : null}
              </>
            )}
          </div>
        </>
      ) : (
        <div style={{ fontSize: 12.5, color: 'var(--color-text-placeholder)', marginTop: 14 }}>
          S3 для backup не настроен в .env (BACKUP_S3_*).
        </div>
      )}
    </Card>
  )
}
