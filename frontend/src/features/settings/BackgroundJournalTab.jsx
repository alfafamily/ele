import { useEffect, useState } from 'react'
import { useRefreshJobsAlert } from '../../app/CompanyContext.jsx'
import { InfiniteScrollSentinel } from '../../shared/InfiniteScrollSentinel.jsx'
import { Tooltip } from '../../shared/Tooltip.jsx'
import { useCursorList } from '../../shared/hooks/useCursorList.js'
import { Banner, Card, Icon, Skeleton } from '../../shared/ui'
import { getBackgroundJournalSummary } from './settingsApi.js'

// Иконка вида задачи (слева в плитке / у события).
const JOB_ICON = {
  backup: 'hard-drive',
  maintenance: 'bell',
  anonymize: 'user-x',
  storage_migration: 'server',
  notifications: 'bell',
}
// Иконка + цвет + подпись статуса. null-статус у плитки — «Нет данных».
const STATUS = {
  ok: { icon: 'circle-check', color: 'var(--color-success)', label: 'Успешно' },
  error: { icon: 'circle-x', color: 'var(--color-error)', label: 'Ошибка' },
  none: { icon: 'circle-minus', color: 'var(--color-text-muted)', label: 'Нет данных' },
}

function formatDate(iso) {
  return new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

// Иконка статуса с кастомным тултипом (тултип показывается только на десктопе —
// см. shared/Tooltip.jsx). Используется в плитках и в ленте.
function StatusIcon({ status, size = 16 }) {
  const s = STATUS[status] || STATUS.none
  return (
    <Tooltip label={s.label} className="bgj-status" style={{ color: s.color }}>
      <Icon name={s.icon} size={size} strokeWidth={2.3} />
    </Tooltip>
  )
}

function JobTile({ job }) {
  const status = job.status || 'none'
  return (
    <div className="bgj-job">
      <span className="bgj-jico">
        <Icon name={JOB_ICON[job.job] || 'server'} size={18} strokeWidth={2} />
      </span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="bgj-jrow">
          <StatusIcon status={status} />
          <span className="bgj-jname">{job.label}</span>
        </div>
        <div className="bgj-jmeta">{job.last_run_at ? `Последний запуск: ${formatDate(job.last_run_at)}` : 'Нет запусков'}</div>
      </div>
    </div>
  )
}

function EventRow({ event }) {
  const s = STATUS[event.status] || STATUS.none
  return (
    <div className="bgj-ev">
      <span className="bgj-dot" style={{ color: s.color }}>
        <Icon name={s.icon} size={17} strokeWidth={2.2} />
      </span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="bgj-evrow">
          <span className="bgj-ejob">{event.label}</span>
          <span className="bgj-etime">{formatDate(event.created_at)}</span>
        </div>
        {event.detail ? (
          <div className="bgj-emsg" style={event.status === 'error' ? { color: 'var(--color-error)' } : undefined}>
            {event.detail}
          </div>
        ) : null}
      </div>
    </div>
  )
}

// Настройки → Журнал фоновых задач (B66). Плашка вводного текста + подложка:
// плитки «последний запуск» по 4 задачам расписания и лента событий (с фильтром
// «Только ошибки» и подгрузкой по скроллу).
export function BackgroundJournalTab() {
  const [jobs, setJobs] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [errorsOnly, setErrorsOnly] = useState(false)
  const refreshJobsAlert = useRefreshJobsAlert()

  // Открытие журнала фиксирует «просмотрено» на бэкенде — обновляем и признак
  // треугольника в шапке, чтобы он погас без перезагрузки.
  useEffect(() => {
    getBackgroundJournalSummary()
      .then((data) => {
        setJobs(data.jobs || [])
        refreshJobsAlert?.()
      })
      .catch(() => setLoadError('Не удалось загрузить журнал фоновых задач.'))
  }, [refreshJobsAlert])

  const { items, loading, loadingMore, hasMore, loadMore, error } = useCursorList(
    '/api/company/background-journal/events/',
    errorsOnly ? { errors_only: 1 } : {},
    { restore: false },
  )

  if (loadError) return <Banner variant="error">{loadError}</Banner>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card className="bgj-intro">
        Автоматические процессы по расписанию: резервные копии, напоминания, обезличивание уволенных и перенос файлов
        хранилища. В журнале виден результат последнего запуска и ошибки.
      </Card>

      <Card className="bgj-data">
        {/* Плитки «последний запуск» по задачам расписания */}
        {jobs === null ? (
          <div style={{ padding: 16 }}>
            <Skeleton height={40} />
          </div>
        ) : (
          <div className="bgj-jobs">
            {jobs.map((job) => (
              <JobTile key={job.job} job={job} />
            ))}
          </div>
        )}

        {/* Лента событий */}
        <div className="bgj-events-head">
          <span className="bgj-events-title">Последние события</span>
          <button
            type="button"
            className={'bgj-filter' + (errorsOnly ? ' bgj-filter--active' : '')}
            onClick={() => setErrorsOnly((v) => !v)}
          >
            Только ошибки
          </button>
        </div>

        {error ? (
          <div className="bgj-empty">Не удалось загрузить события.</div>
        ) : loading ? (
          <div style={{ padding: 16 }}>
            <Skeleton height={40} />
          </div>
        ) : items.length === 0 ? (
          <div className="bgj-empty">{errorsOnly ? 'Ошибок пока нет.' : 'Событий пока нет.'}</div>
        ) : (
          <div>
            {items.map((event) => (
              <EventRow key={event.id} event={event} />
            ))}
            <InfiniteScrollSentinel hasMore={hasMore} loading={loadingMore} onLoadMore={loadMore} />
          </div>
        )}
      </Card>
    </div>
  )
}
