import { useEffect, useState } from 'react'
import { Banner, Card, Skeleton } from '../../shared/ui'
import { getUpdateInfo } from './settingsApi.js'

// Команда обновления — из docs/INSTALL.md («Обновление версии»). Каталог
// установки берём с бэкенда (install.sh пишет его в .env); выполняется на
// сервере, не из интерфейса (бэкенд в контейнере не имеет доступа к docker/git
// хоста).
const buildCommand = (dir) => `cd ${dir || '/opt/ele'}
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

  const command = buildCommand(info?.install_dir)

  const copyCommand = async () => {
    try {
      await navigator.clipboard.writeText(command)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard недоступен (не https / нет прав) — пользователь скопирует вручную */
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 19, fontWeight: 600 }}>Обновление</div>

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
                  Выполните на сервере:
                </div>
                <div style={{ position: 'relative' }}>
                  <pre style={{ margin: 0, padding: '12px 46px 12px 14px', background: 'var(--color-fill-input)', borderRadius: 'var(--radius-control)', fontSize: 12.5, fontFamily: 'var(--font-mono)', lineHeight: 1.6, overflowX: 'auto' }}>{command}</pre>
                  <button
                    type="button"
                    onClick={copyCommand}
                    title={copied ? 'Скопировано' : 'Скопировать команду'}
                    aria-label="Скопировать команду"
                    style={{
                      position: 'absolute',
                      top: 8,
                      right: 8,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 30,
                      height: 30,
                      padding: 0,
                      border: 'none',
                      borderRadius: 8,
                      background: 'var(--color-surface)',
                      color: copied ? 'var(--color-success)' : 'var(--color-text-muted)',
                      boxShadow: 'inset 0 0 0 1px var(--color-border)',
                      cursor: 'pointer',
                      WebkitAppearance: 'none',
                      appearance: 'none',
                    }}
                  >
                    {copied ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    ) : (
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </>
          ) : null}
        </Card>
      ) : null}
    </div>
  )
}
