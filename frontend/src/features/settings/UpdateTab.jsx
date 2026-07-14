import { useEffect, useState } from 'react'
import { Banner, Button, Card, Skeleton } from '../../shared/ui'
import { getUpdateInfo } from './settingsApi.js'

// Команда обновления — из docs/INSTALL.md («Обновление версии»). Путь /opt/ele —
// каталог установки по умолчанию; выполняется на сервере, не из интерфейса
// (бэкенд в контейнере не имеет доступа к docker/git хоста).
const UPDATE_COMMAND = `cd /opt/ele
git pull --ff-only
docker compose -f docker-compose.prod.yml up -d --build`

export function UpdateTab() {
  const [info, setInfo] = useState(null)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    getUpdateInfo()
      .then(setInfo)
      .catch((err) => setError(err.detail || 'Не удалось загрузить сведения о версии.'))
  }, [])

  const copyCommand = async () => {
    try {
      await navigator.clipboard.writeText(UPDATE_COMMAND)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard недоступен (не https / нет прав) — пользователь скопирует вручную */
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ fontSize: 19, fontWeight: 600 }}>Обновление</div>
        <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 6, lineHeight: 1.5, maxWidth: 760 }}>
          Текущая версия инстанса и проверка наличия новой версии в репозитории. Обновление выполняется на сервере
          командой ниже — из интерфейса оно не запускается.
        </div>
      </div>

      {error ? <Banner variant="error">{error}</Banner> : null}

      {!info && !error ? (
        <Card>
          <Skeleton height={48} />
        </Card>
      ) : info ? (
        <Card style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Текущая версия</div>
              <div style={{ fontSize: 22, fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{info.current_version}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              {!info.check_ok ? (
                <span style={{ fontSize: 13, color: 'var(--color-text-placeholder)' }}>
                  Не удалось проверить обновления<br />(нет доступа к репозиторию)
                </span>
              ) : info.update_available ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, color: 'var(--color-primary)' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-primary)' }} />
                  Доступно обновление: {info.latest_version}
                </span>
              ) : (
                <span style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>Установлена последняя версия</span>
              )}
            </div>
          </div>

          {info.update_available ? (
            <>
              <a href={info.release_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: 'var(--color-primary)', fontWeight: 600, textDecoration: 'none' }}>
                Показать изменения ↗
              </a>
              <div>
                <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 6 }}>
                  Выполните на сервере (в каталоге установки):
                </div>
                <pre style={{ margin: 0, padding: '12px 14px', background: 'var(--color-fill-input)', borderRadius: 'var(--radius-control)', fontSize: 12.5, fontFamily: 'var(--font-mono)', lineHeight: 1.6, overflowX: 'auto' }}>{UPDATE_COMMAND}</pre>
                <Button variant="secondary" onClick={copyCommand} style={{ marginTop: 10 }}>
                  {copied ? 'Скопировано' : 'Скопировать команду'}
                </Button>
              </div>
            </>
          ) : null}
        </Card>
      ) : null}
    </div>
  )
}
