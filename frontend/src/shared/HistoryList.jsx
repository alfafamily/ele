import { useEffect, useMemo, useState } from 'react'
import { apiGet } from './api/client'
import { EmptyHint, Skeleton, TabBar } from './ui'
import { Icon } from './ui/Icon/Icon.jsx'
import { AcceptanceIcon } from './AcceptanceIcon.jsx'
import { DeviceSnapshotChip } from './DeviceSnapshot.jsx'
import './HistoryList.css'

function formatDate(iso) {
  const d = new Date(iso)
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// B32. Строки статуса акцепта под движением закрепления: негромкая иконка тона
// (единый набор — absentia жёлтая галочка, pending часы, accepted зелёная
// галочка, rejected красный крестик) + текст.
function AcceptanceLines({ items }) {
  if (!items?.length) return null
  return items.map((a, j) => {
    // Обратная совместимость: старый формат — просто строка.
    const text = typeof a === 'string' ? a : a.text
    const tone = typeof a === 'string' ? null : a.tone
    const snapshot = typeof a === 'string' ? null : a.snapshot
    return (
      // Серая черта слева охватывает и статус, и плашку слепка — единый контейнер
      // с border-left (колонкой), внутри строка «иконка + текст» и плашка ниже.
      <div key={j} className="ele-history__acceptance" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
          <AcceptanceIcon status={tone} size={14} style={{ opacity: 0.9 }} />
          <span>{text}</span>
        </div>
        {/* Слепок устройства — отдельной строкой под статусом (плашка). */}
        {snapshot ? (
          <div style={{ paddingLeft: 20 }}>
            <DeviceSnapshotChip snapshot={snapshot} />
          </div>
        ) : null}
      </div>
    )
  })
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

// Строка перечня заполненных полей в записи «Объект создан». Секретные
// (Номер/ключ, серийник токена) маскируются и раскрываются кнопкой-«глаз».
function HistoryLine({ line }) {
  const [revealed, setRevealed] = useState(false)
  const value = line.secret && !revealed ? '••••' : line.value
  return (
    <li>
      <span className="ele-history__line-label">{line.label}:</span> {value}
      {line.secret ? (
        <button type="button" className="ele-history__eye" onClick={() => setRevealed((r) => !r)} title={revealed ? 'Скрыть' : 'Показать'} aria-label={revealed ? 'Скрыть' : 'Показать'}>
          <Icon name={revealed ? 'eye-off' : 'eye'} size={15} />
        </button>
      ) : null}
    </li>
  )
}

// Блок «когда/кто» — общий для всех типов строк.
function HistoryWhen({ row }) {
  return (
    <div className="ele-history__when">
      <div className="ele-history__date">
        <Icon name="calendar-clock" size={13} strokeWidth={2} style={{ color: 'var(--color-text-placeholder)', flex: 'none' }} />
        <span>{formatDate(row.date)}</span>
      </div>
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
              <HistoryLine key={i} line={ln} />
            ))}
          </ul>
        ) : null}
        {row.comment ? <div className="ele-history__comment">Комментарий: {row.comment}</div> : null}
        {/* B32: статус акцепта под движением закрепления (создание / раздача инструмента). */}
        <AcceptanceLines items={row.acceptance} />
      </div>
    </div>
  )
}

const FILTERS = [
  { value: 'all', label: 'Все' },
  { value: 'change', label: 'Изменения' },
  { value: 'movement', label: 'Движения' },
]
// B13. Фильтр «Выполненные ТО» показываем только на карточках, где такие записи
// есть (компонент общий — у лицензий/SIM его быть не должно).
const MAINTENANCE_FILTER = { value: 'maintenance', label: 'Выполненные ТО' }

// «История изменений» — сворачиваемый блок для карточек. Данные грузятся лениво
// при первом раскрытии. Строки делятся на движения (создание, привязка/
// открепление, списание/утилизация) и изменения реквизитов — можно фильтровать.
// reloadKey — любое меняющееся значение от родителя (счётчик, который карточка
// увеличивает после действий: привязка/открепление/списание/утилизация). Пока
// история раскрыта, её изменение перезапрашивает данные — чтобы новое движение
// появлялось сразу, без перезагрузки страницы.
// maintenanceOnly — для ролей ТО (Автомеханик / Механик по оборудованию):
// показываем ТОЛЬКО выполненные ТО, без остальных вкладок и записей.
export function HistoryList({ path, reloadKey, maintenanceOnly = false }) {
  const [items, setItems] = useState(null)
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState(maintenanceOnly ? 'maintenance' : 'all')

  // Смена объекта — сбрасываем состояние.
  useEffect(() => {
    setItems(null)
    setOpen(false)
    setFilter(maintenanceOnly ? 'maintenance' : 'all')
  }, [path, maintenanceOnly])

  // Грузим при раскрытии и перезапрашиваем при смене reloadKey (старые строки при
  // этом остаются на экране до прихода новых — без «мигания» скелетоном).
  useEffect(() => {
    if (!open) return
    let cancelled = false
    apiGet(path).then((data) => {
      if (!cancelled) setItems(data)
    })
    return () => {
      cancelled = true
    }
  }, [open, path, reloadKey])

  const filters = useMemo(() => {
    const hasMaintenance = items?.some((h) => h.category === 'maintenance')
    return hasMaintenance ? [...FILTERS, MAINTENANCE_FILTER] : FILTERS
  }, [items])

  const filtered = useMemo(() => {
    if (!items) return items
    if (filter === 'all') return items
    // Движения — записи с category==='movement' (привязка/утилизация); Изменения —
    // правки реквизитов (category==='change'); Выполненные ТО — 'maintenance'.
    // «Объект создан» — гибрид: показываем и в «Движениях» (поступление,
    // комментарий откуда), и в «Изменениях» (реквизиты создания).
    return items.filter((h) => {
      if (h.kind === 'created') return filter === 'movement' || filter === 'change'
      return (h.category || 'change') === filter
    })
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
          <EmptyHint style={{ marginTop: 12 }}>Изменений пока нет.</EmptyHint>
        ) : (
          <>
            {maintenanceOnly ? null : (
              <div className="ele-history__filter">
                <TabBar options={filters} value={filter} onChange={setFilter} size="control" variant="filter" />
              </div>
            )}
            {filtered.length === 0 ? (
              <EmptyHint style={{ marginTop: 12 }}>
                {filter === 'movement'
                  ? 'Движений пока нет.'
                  : filter === 'maintenance'
                    ? 'Выполненных ТО пока нет.'
                    : 'Изменений реквизитов пока нет.'}
              </EmptyHint>
            ) : (
              <div className="ele-history">
                {filtered.map((h, i) =>
                  h.kind === 'changed' ? (
                    // 2 колонки: слева дата/кто, справа «что» и под ним «было→стало».
                    <div className="ele-history__row" key={i}>
                      <HistoryWhen row={h} />
                      <div className="ele-history__change">
                        <div className="ele-history__what">{h.title || `Изменено «${h.label}»`}</div>
                        <div className="ele-history__value">
                          <HistoryValue row={h} />
                          {h.comment ? <div className="ele-history__comment">Комментарий: {h.comment}</div> : null}
                          {/* B32: статус акцепта, подшитый к движению закрепления. */}
                          <AcceptanceLines items={h.acceptance} />
                        </div>
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
