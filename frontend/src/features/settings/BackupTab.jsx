import { useEffect, useState } from 'react'
import { useCursorList } from '../../shared/hooks/useCursorList.js'
import { useMediaQuery } from '../../shared/hooks/useMediaQuery.js'
import { Badge, Banner, Button, Card, Checkbox, Icon, Input, Skeleton } from '../../shared/ui'
import {
  backupDownloadUrl,
  createBackup,
  getBackupSettings,
  testSecondaryS3,
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
const DEST_LABEL = { own: 'Своё хранилище', secondary_s3: 'Резервный S3' }

// Индикатор результата проверки рядом с кнопкой (как в SystemTab).
function CheckResult({ result }) {
  if (!result) return null
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
      <Icon name={result.ok ? 'circle-check' : 'circle-x'} size={20} strokeWidth={2} style={{ flex: 'none', color: result.ok ? 'var(--color-success)' : 'var(--color-error)' }} />
      {!result.ok && result.msg ? <span style={{ color: 'var(--color-error)', fontSize: 13 }}>{result.msg}</span> : null}
    </span>
  )
}

// Плашка статуса выгрузки в одно назначение: галочка/крестик + название.
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
  // Ручной экспорт: пароль шифрования + выгрузка на резервный S3.
  const [passphrase, setPassphrase] = useState('')
  const [toSecondary, setToSecondary] = useState(false)
  // Проверка резервного S3.
  const [s3Testing, setS3Testing] = useState(false)
  const [s3Result, setS3Result] = useState(null)
  const { items, loading, refetch } = useCursorList('/api/backup/history/', {})

  useEffect(() => {
    getBackupSettings().then((s) => {
      setSettings(s)
      setToSecondary(!!s.backup_secondary_s3_enabled && !!s.backup_secondary_s3?.configured)
    })
  }, [])

  const secondaryConfigured = !!settings?.backup_secondary_s3?.configured

  const doCreateBackup = async () => {
    setCreating(true)
    setError(null)
    try {
      await createBackup({ passphrase: passphrase || '', to_secondary: secondaryConfigured ? toSecondary : false })
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

  const runS3Test = async () => {
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
        {secondaryConfigured ? (
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, cursor: 'pointer', fontSize: 14 }}>
            <input type="checkbox" checked={toSecondary} onChange={(e) => setToSecondary(e.target.checked)} style={{ flex: 'none' }} />
            Также выгрузить копию на резервный S3
          </label>
        ) : null}
      </Card>

      {/* Резервный (сторонний) S3 */}
      {settings ? (
        <Card>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Резервный S3 (аварийная копия)</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)', marginTop: 4, marginBottom: 14, lineHeight: 1.5 }}>
            Отдельное S3-хранилище для полных копий — независимое от хранилища файлов. Параметры задаются в .env сервера
            (BACKUP_S3_*). Из такой копии можно развернуть систему заново, даже если основной сервер потерян.
          </div>
          {secondaryConfigured ? (
            <>
              <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 12 }}>
                Подключено: <b>{settings.backup_secondary_s3.bucket}</b>
                {settings.backup_secondary_s3.endpoint ? ` (${settings.backup_secondary_s3.endpoint})` : ''}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
                <Button type="button" variant="secondary" loading={s3Testing} onClick={runS3Test}>
                  Проверить подключение
                </Button>
                <CheckResult result={s3Result} />
              </div>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: savingSettings ? 'default' : 'pointer' }}>
                <input
                  type="checkbox"
                  checked={!!settings.backup_secondary_s3_enabled}
                  disabled={savingSettings}
                  onChange={(e) => patchSettings({ backup_secondary_s3_enabled: e.target.checked })}
                  style={{ marginTop: 2, flex: 'none' }}
                />
                <span style={{ minWidth: 0 }}>
                  <span style={{ fontSize: 14, fontWeight: 500 }}>Выгружать копии на резервный S3</span>
                  <span style={{ display: 'block', fontSize: 12, color: 'var(--color-text-placeholder)', marginTop: 2 }}>
                    Автоматические копии (по расписанию) будут дополнительно выгружаться на резервный S3.
                  </span>
                </span>
              </label>
              {settings.backup_secondary_s3_enabled ? (
                <div style={{ maxWidth: 260, marginTop: 14 }}>
                  <Input
                    label="Хранить копий на резервном S3"
                    type="number"
                    min={1}
                    value={settings.backup_secondary_s3_retention}
                    onChange={(e) => setSettings({ ...settings, backup_secondary_s3_retention: Number(e.target.value) })}
                    onBlur={() => patchSettings({ backup_secondary_s3_retention: settings.backup_secondary_s3_retention })}
                  />
                </div>
              ) : null}
            </>
          ) : (
            <Banner variant="info">Параметры резервного S3 не заданы в .env (BACKUP_S3_*) — выгрузка недоступна.</Banner>
          )}
        </Card>
      ) : null}

      {/* Автокопирование */}
      {settings ? (
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>Автоматическое создание резервных копий</div>
              <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 4 }}>Ежедневно, с настройкой глубины хранения — последние N копий</div>
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
                </div>
                <div style={{ flex: 'none' }}>
                  {b.downloadable ? (
                    <a href={backupDownloadUrl(b.id)} title="Скачать">
                      <Icon name="download" size={18} style={{ color: '#757784' }} />
                    </a>
                  ) : (
                    <span title="Своей копии нет — доступна только на резервном S3" style={{ color: 'var(--color-text-placeholder)' }}>
                      <Icon name="cloud" size={18} />
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
