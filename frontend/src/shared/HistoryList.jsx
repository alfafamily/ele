import { useEffect, useMemo, useState } from 'react'
import { apiGet } from './api/client'
import { Skeleton } from './ui'
import { Icon } from './ui/Icon/Icon.jsx'
import './HistoryList.css'

function formatDate(iso) {
  const d = new Date(iso)
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// Значение изменения «было → стало». Секретные реквизиты (Номер/ключ у лицензий)
// по умолчанию маскируются, раскрываются кнопкой-«глаз».
function HistoryValue({ row }) {
  const [revealed, setRevealed] = useState(false)
  if (row.kind !== 'changed') return null
  const mask = '••••'
  const old = row.secret && !revealed ? mask : row.old
  const next = row.secret && !revealed ? mask : row.new
  return (
    <span className="ele-history__value-inner">
      <span className="ele-history__old">{old}</span>
      <span className="ele-history__arrow"> → </span>
      <span className="ele-history__new">{next}</span>
      {row.secret ? (
        <button type="button" className="ele-history__eye" onClick={() => setRevealed((r) => !r)} title={revealed ? 'Скрыть' : 'Показать'} aria-label={revealed ? 'Скрыть' : 'Показать'}>
          <Icon name={revealed ? 'eye-off' : 'eye'} size={15} />
        </button>
      ) : null}
    </span>
  )
}

// Блок «когда/кто» — общий для всех типов строк.
function HistoryWhen({ row }) {
  return (
    <div className="ele-history__when">
      <div className="ele-history__date">{formatDate(row.date)}</div>
      <div className="ele-history__author">{row.author || 'Система'}</div>
    </div>
  )
}

// Строка-движение (создание / привязка / утилизация / списание): заголовок,
// перечень заполненных при создании полей и необязательный комментарий.
function HistoryEventRow({ row }) {
  const title = row.kind === 'created' ? 'Объект создан' : row.label
  return (
    <div className="ele-history__row ele-history__row--event">
      <HistoryWhen row={row} />
      <div className="ele-history__event">
        <div className="ele-history__what ele-history__event-title">{title}</div>
        {row.lines?.length ? (
          <ul className="ele-history__lines">
            {row.lines.map((ln, i) => (
              <li key={i}>
                <span className="ele-history__line-label">{ln.label}:</span> {ln.value}
              </li>
            ))}
          </ul>
        ) : null}
        {row.comment ? <div className="ele-history__comment">Комментарий: {row.comment}</div> : null}
      </div>
    </div>
  )
}

const FILTERS = [
  { key: 'all', label: 'Все' },
  { key: 'movement', label: 'Движения' },
  { key: 'change', label: 'Изменения' },
]

// «История изменений» — сворачиваемый блок для карточек. Данные грузятся лениво
// при первом раскрытии. Строки делятся на движения (создание, привязка/
// открепление, списание/утилизация) и изменения реквизитов — можно фильтровать.
export function HistoryList({ path }) {
  const [items, setItems] = useState(null)
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('all')

  // Смена объекта — сбрасываем состояние.
  useEffect(() => {
    setItems(null)
    setOpen(false)
    setFilter('all')
  }, [path])

  useEffect(() => {
    if (!open || items !== null) return
    let cancelled = false
    apiGet(path).then((data) => {
      if (!cancelled) setItems(data)
    })
    return () => {
      cancelled = true
    }
  }, [open, items, path])

  const filtered = useMemo(() => {
    if (!items) return items
    if (filter === 'all') return items
    // Движения — записи с category==='movement' (создание/привязка/утилизация);
    // Изменения — правки реквизитов (category==='change'). Старые записи без
    // category считаем изменениями.
    return items.filter((h) => (h.category || 'change') === filter)
  }, [items, filter])

  return (
    <div>
      <button type="button" className="ele-history__toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="ele-history__toggle-title">История изменений</span>
        <Icon name="chevron-right" size={18} strokeWidth={2} className={'ele-history__chevron' + (open ? ' ele-history__chevron--open' : '')} />
      </button>

      {open ? (
        items === null ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
            <Skeleton height={14} />
            <Skeleton height={14} />
          </div>
        ) : items.length === 0 ? (
          <div style={{ fontSize: 13.5, color: 'var(--color-text-muted)', marginTop: 12 }}>Изменений пока нет.</div>
        ) : (
          <>
            <div className="ele-history__filter" role="tablist">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  role="tab"
                  aria-selected={filter === f.key}
                  className={'ele-history__filter-btn' + (filter === f.key ? ' ele-history__filter-btn--active' : '')}
                  onClick={() => setFilter(f.key)}
                >
                  {f.label}
                </button>
              ))}
            </div>
            {filtered.length === 0 ? (
              <div style={{ fontSize: 13.5, color: 'var(--color-text-muted)', marginTop: 12 }}>
                {filter === 'movement' ? 'Движений пока нет.' : 'Изменений реквизитов пока нет.'}
              </div>
            ) : (
              <div className="ele-history">
                {filtered.map((h, i) =>
                  h.kind === 'changed' ? (
                    <div className="ele-history__row" key={i}>
                      <HistoryWhen row={h} />
                      <div className="ele-history__what">{`Изменено «${h.label}»`}</div>
                      <div className="ele-history__value">
                        <HistoryValue row={h} />
                        {h.comment ? <div className="ele-history__comment">Комментарий: {h.comment}</div> : null}
                      </div>
                    </div>
                  ) : (
                    <HistoryEventRow row={h} key={i} />
                  ),
                )}
              </div>
            )}
          </>
        )
      ) : null}
    </div>
  )
}
