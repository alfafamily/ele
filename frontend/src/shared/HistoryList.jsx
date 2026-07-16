import { useEffect, useState } from 'react'
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

// «История изменений» — сворачиваемый блок для карточек Оборудования и
// Лицензии: что изменили (реквизит) и как (было → стало). Данные грузятся
// лениво при первом раскрытии.
export function HistoryList({ path }) {
  const [items, setItems] = useState(null)
  const [open, setOpen] = useState(false)

  // Смена объекта — сбрасываем состояние.
  useEffect(() => {
    setItems(null)
    setOpen(false)
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
          <div className="ele-history">
            {items.map((h, i) => (
              <div className="ele-history__row" key={i}>
                <div className="ele-history__when">
                  <div className="ele-history__date">{formatDate(h.date)}</div>
                  <div className="ele-history__author">{h.author || 'Система'}</div>
                </div>
                <div className="ele-history__what">{h.kind === 'created' ? 'Объект создан' : `Изменено «${h.label}»`}</div>
                <div className="ele-history__value">
                  <HistoryValue row={h} />
                </div>
              </div>
            ))}
          </div>
        )
      ) : null}
    </div>
  )
}
