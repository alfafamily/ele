import { useEffect, useState } from 'react'
import { useCursorList } from '../../shared/hooks/useCursorList.js'
import { useMediaQuery } from '../../shared/hooks/useMediaQuery.js'
import { Badge, Banner, Button, Card, Checkbox, ConfirmModal, Icon, Input, Skeleton } from '../../shared/ui'
import {
  backupDownloadUrl,
  createBackup,
  deleteBackup,
  getBackupSettings,
  updateBackupSettings,
} from './settingsApi.js'

function formatSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`
}
function formatDate(iso) {
  return new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
const TYPE_LABEL = { manual: 'Вручную', auto: 'Авто' }
const DEST_LABEL = { own: 'Хранилище приложения', secondary_s3: 'S3 для backup' }

function DestinationBadge({ dest }) {
  const label = DEST_LABEL[dest.destination] || dest.destination
  return (
    <Badge style={dest.ok ? undefined : { color: 'var(--color-error)' }}>
      <Icon name={dest.ok ? 'check' : 'x'} size={12} strokeWidth={2.5} style={{ color: dest.ok ? 'var(--color-success)' : 'var(--color-error)' }} />
      {label}
    </Badge>
  )
}

export function BackupTab() {
  const isMobile = useMediaQuery('(max-width: 768px)')
  const backupPad = isMobile ? '12px 12px' : '12px 18px'
  const [settings, setSettings] = useState(null)
  const [creating, setCreating] = useState(false)
  const [savingSettings, setSavingSettings] = useState(false)
  const [error, setError] = useState(null)
  // Ручной экспорт: только пароль шифрования (назначение — в «Системные»).
  const [passphrase, setPassphrase] = useState('')
  // Копия, ожидающая подтверждения удаления (null — модалка закрыта).
  const [toDelete, setToDelete] = useState(null)
  const { items, loading, refetch } = useCursorList('/api/backup/history/', {})

  useEffect(() => {
    getBackupSettings().then(setSettings)
  }, [])

  const doCreateBackup = async () => {
    setCreating(true)
    setError(null)
    try {
      await createBackup({ passphrase: passphrase || '' })
      setPassphrase('')
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
      setSettings((prev) => ({ ...prev, ...updated }))
    } finally {
      setSavingSettings(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {error ? <Banner variant="error">{error}</Banner> : null}

      <Card>
        <div style={{ fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
          Резервная копия — это полный самодостаточный архив: вся база данных и сами файлы (аватары, файлы-реквизиты,
          вложения) внутри одного файла. Из такой копии систему можно полностью восстановить на другом сервере.
        </div>
        <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 8, lineHeight: 1.5 }}>
          Копия содержит чувствительные данные (в т.ч. хэши паролей) — храните и передавайте её только по защищённым
          каналам. Восстановление выполняется командой на сервере. При необходимости копию можно зашифровать паролем.
        </div>
      </Card>

      {/* Ручной экспорт */}
      {settings ? (
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>Создать резервную копию сейчас</div>
              <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 4 }}>Разовый полный экспорт: база данных + файлы</div>
            </div>
            <Button loading={creating} onClick={doCreateBackup} style={{ flex: 'none' }}>
              Экспорт
            </Button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12, marginTop: 16 }}>
            <Input
              label="Пароль для шифрования (необязательно)"
              type="password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder="Без пароля — архив не шифруется"
              autoComplete="new-password"
            />
          </div>
        </Card>
      ) : null}

      {/* Автокопирование */}
      {settings ? (
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>Автоматическое создание резервных копий</div>
              <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 4 }}>Ежедневно, полный архив (база данных + файлы), с настройкой глубины хранения</div>
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
              <div style={{ fontSize: 12.5, color: 'var(--color-text-placeholder)', marginTop: 10, lineHeight: 1.5 }}>
                Шифрование автоматических копий задаётся переменной <b style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}>BACKUP_PASSPHRASE</b> в .env сервера
                (при пустом значении авто-копии не шифруются) — пароль в блоке создания резервной копии сейчас применяется только к ручному экспорту.
              </div>
            </>
          ) : null}
        </Card>
      ) : null}

      {/* История копий */}
      <Card style={{ padding: '6px 6px 6px' }}>
        {loading ? (
          <div style={{ padding: 16 }}>
            <Skeleton height={40} />
          </div>
        ) : items.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--color-text-placeholder)', fontSize: 13.5 }}>Резервных копий ещё не было.</div>
        ) : (
          <div>
            {items.map((b) => (
              <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: backupPad, borderTop: '1px solid var(--color-border-hairline)', flexWrap: 'wrap' }}>
                <div style={{ font: '500 13px var(--font-mono)', minWidth: 140 }}>{formatDate(b.created_at)}</div>
                <div style={{ color: 'var(--color-text-muted)', fontSize: 13, minWidth: 64 }}>{formatSize(b.size)}</div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
                  <Badge>{TYPE_LABEL[b.backup_type]}</Badge>
                  {b.encrypted ? (
                    <Badge>
                      <Icon name="lock" size={12} strokeWidth={2.2} />
                      Зашифровано
                    </Badge>
                  ) : null}
                  {(b.destinations || []).map((d) => (
                    <DestinationBadge key={d.destination} dest={d} />
                  ))}
                  {b.app_version ? (
                    <span style={{ fontSize: 12.5, color: 'var(--color-text-placeholder)' }}>
                      Версия приложения: v.{b.app_version}
                    </span>
                  ) : null}
                </div>
                <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 14 }}>
                  {b.downloadable ? (
                    <a href={backupDownloadUrl(b.id)} title="Скачать">
                      <Icon name="download" size={18} style={{ color: '#757784' }} />
                    </a>
                  ) : (
                    <span title="Файл копии недоступен для скачивания" style={{ color: 'var(--color-text-placeholder)', display: 'inline-flex' }}>
                      <Icon name="cloud" size={18} />
                    </span>
                  )}
                  <button
                    type="button"
                    title="Удалить копию"
                    onClick={() => setToDelete(b)}
                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'inline-flex', color: 'var(--color-text-placeholder)' }}
                  >
                    <Icon name="trash-2" size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {toDelete ? (
        <ConfirmModal
          title="Удалить резервную копию?"
          message={`Копия от ${formatDate(toDelete.created_at)} будет удалена без возможности восстановления (в т.ч. из хранилища приложения и с резервного S3).`}
          confirmLabel="Удалить"
          onConfirm={async () => {
            await deleteBackup(toDelete.id)
            refetch()
          }}
          onClose={() => setToDelete(null)}
        />
      ) : null}
    </div>
  )
}
