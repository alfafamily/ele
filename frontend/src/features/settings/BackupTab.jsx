import { useEffect, useState } from 'react'
import { useCursorList } from '../../shared/hooks/useCursorList.js'
import { useMediaQuery } from '../../shared/hooks/useMediaQuery.js'
import { Banner, Button, Card, Checkbox, Input, Skeleton } from '../../shared/ui'
import { backupDownloadUrl, createBackup, getBackupSettings, updateBackupSettings } from './settingsApi.js'

function formatSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`
}
function formatDate(iso) {
  return new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
const TYPE_LABEL = { manual: 'Вручную', auto: 'Авто' }

export function BackupTab() {
  const isMobile = useMediaQuery('(max-width: 768px)')
  const backupCols = isMobile ? '1fr auto auto 28px' : '200px 1fr 130px 40px'
  const backupPad = isMobile ? '12px 12px' : '12px 18px'
  const [settings, setSettings] = useState(null)
  const [creating, setCreating] = useState(false)
  const [savingSettings, setSavingSettings] = useState(false)
  const [error, setError] = useState(null)
  const { items, loading, refetch } = useCursorList('/api/backup/history/', {})

  useEffect(() => {
    getBackupSettings().then(setSettings)
  }, [])

  const doCreateBackup = async () => {
    setCreating(true)
    setError(null)
    try {
      await createBackup()
      refetch()
    } catch (err) {
      setError(err.detail || 'Не удалось создать резервную копию.')
    } finally {
      setCreating(false)
    }
  }

  const patchSettings = async (patch) => {
    setSavingSettings(true)
    try {
      const updated = await updateBackupSettings(patch)
      setSettings(updated)
    } finally {
      setSavingSettings(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ fontSize: 19, fontWeight: 600 }}>Резервное копирование</div>
        <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 6, lineHeight: 1.5, maxWidth: 760 }}>
          Система создает файл, который можно скачать с объектами в системе: оборудование, лицензии, сотрудники,
          пользователи (с хэшами паролей), типы, ссылки на файлы. Файлы необходимо выгрузить из хранилища
          самостоятельно, по ссылкам указанным в объектах файла экспорта.
        </div>
        <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 8, lineHeight: 1.5, maxWidth: 760 }}>
          Файл содержит чувствительные данные — храните и передавайте его только по защищённым каналам.
        </div>
      </div>

      {error ? <Banner variant="error">{error}</Banner> : null}

      {/* Создать копию и Автокопирование — друг под другом (первым — «Создать
          резервную копию»). */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Card style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Создать резервную копию сейчас</div>
            <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 4 }}>Разовый экспорт в файл</div>
          </div>
          <Button loading={creating} onClick={doCreateBackup} style={{ flex: 'none' }}>
            Экспорт
          </Button>
        </Card>

        {settings ? (
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600 }}>Автоматическое создание резервных копий</div>
                <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 4 }}>Ежедневно, с настройкой глубины хранения — последние N дней</div>
              </div>
              <Checkbox
                checked={settings.auto_backup_enabled}
                onChange={(checked) => {
                  setSettings({ ...settings, auto_backup_enabled: checked })
                  patchSettings({ auto_backup_enabled: checked })
                }}
                disabled={savingSettings}
              />
            </div>
            {settings.auto_backup_enabled ? (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12, marginTop: 16 }}>
                  <Input
                    label="Время автокопирования"
                    type="time"
                    value={settings.auto_backup_time?.slice(0, 5) || '03:00'}
                    onChange={(e) => setSettings({ ...settings, auto_backup_time: e.target.value })}
                    onBlur={() => patchSettings({ auto_backup_time: settings.auto_backup_time })}
                  />
                  <Input
                    label="Хранить последних копий"
                    type="number"
                    min={1}
                    value={settings.auto_backup_retention}
                    onChange={(e) => setSettings({ ...settings, auto_backup_retention: Number(e.target.value) })}
                    onBlur={() => patchSettings({ auto_backup_retention: settings.auto_backup_retention })}
                  />
                </div>
                {settings.server_time ? (
                  <div style={{ fontSize: 12.5, color: 'var(--color-text-placeholder)', marginTop: 8, lineHeight: 1.5 }}>
                    Время указывается по часам сервера. Сейчас на сервере:{' '}
                    <b style={{ color: 'var(--color-text-muted)' }}>
                      {new Date(settings.server_time).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: settings.server_timezone })}
                    </b>{' '}
                    ({settings.server_timezone}).
                  </div>
                ) : null}
              </>
            ) : null}
          </Card>
        ) : null}
      </div>

      <Card style={{ padding: '6px 6px 6px' }}>
        {loading ? (
          <div style={{ padding: 16 }}>
            <Skeleton height={40} />
          </div>
        ) : items.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--color-text-placeholder)', fontSize: 13.5 }}>Резервных копий ещё не было.</div>
        ) : (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: backupCols, gap: 8, padding: backupPad, fontSize: 11, fontWeight: 600, letterSpacing: '.6px', color: 'var(--color-text-placeholder)', textTransform: 'uppercase' }}>
              <div>Дата</div>
              <div>Размер</div>
              <div>Тип</div>
              <div></div>
            </div>
            {items.map((b) => (
              <div key={b.id} style={{ display: 'grid', gridTemplateColumns: backupCols, gap: 8, padding: backupPad, borderTop: '1px solid var(--color-border-hairline)', alignItems: 'center', fontSize: 14 }}>
                <div style={{ font: '500 13px var(--font-mono)' }}>{formatDate(b.created_at)}</div>
                <div style={{ color: 'var(--color-text-muted)' }}>{formatSize(b.size)}</div>
                <div style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>{TYPE_LABEL[b.backup_type]}</div>
                <div style={{ textAlign: 'right' }}>
                  <a href={backupDownloadUrl(b.id)} title="Скачать">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#757784" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
                    </svg>
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
