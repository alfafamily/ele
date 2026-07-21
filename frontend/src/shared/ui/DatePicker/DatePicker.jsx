import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '../Icon/Icon.jsx'
import './DatePicker.css'

const MONTHS = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
]
const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

// Работаем с датой как с тройкой {y, m, d} — без Date-арифметики, чтобы не
// ловить сдвиги часовых поясов. ISO — «YYYY-MM-DD».
function parseISO(iso) {
  if (!iso) return null
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return null
  return { y, m: m - 1, d }
}
function toISO(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}
function todayParts() {
  const t = new Date()
  return { y: t.getFullYear(), m: t.getMonth(), d: t.getDate() }
}
function formatRu(parts) {
  return `${String(parts.d).padStart(2, '0')}.${String(parts.m + 1).padStart(2, '0')}.${parts.y}`
}
// Сравнение по календарным дням: <0 если a раньше b.
function cmp(a, b) {
  return a.y - b.y || a.m - b.m || a.d - b.d
}
function daysInMonth(y, m) {
  return new Date(y, m + 1, 0).getDate()
}
// Индекс дня недели с понедельника (0=Пн … 6=Вс).
function mondayIndex(y, m, d) {
  return (new Date(y, m, d).getDay() + 6) % 7
}

// Кастомный выбор даты (B13). value/onChange — ISO «YYYY-MM-DD» либо ''.
// minDate (ISO) — минимально доступная дата (по умолчанию сегодня); более ранние
// дни приглушены и недоступны. Выходные — красные, сегодня — подчёркнут,
// выбранный день — в чёрном круге. Поле оформлено как обычный инпут с плавающим
// лейблом (label): пусто — лейбл-плейсхолдер по центру; заполнено/открыто —
// лейбл уезжает наверх, ниже показывается выбранная дата.
export function DatePicker({ label, value, onChange, minDate, id }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  const selected = useMemo(() => parseISO(value), [value])
  const min = useMemo(() => parseISO(minDate) || todayParts(), [minDate])
  const today = useMemo(() => todayParts(), [])

  // Показываемый месяц: месяц выбранной даты, иначе минимально доступный.
  const [view, setView] = useState(() => {
    const base = parseISO(value) || parseISO(minDate) || todayParts()
    return { y: base.y, m: base.m }
  })

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const openCalendar = () => {
    // При открытии показываем месяц выбранной даты (или минимальный).
    const base = selected || min
    setView({ y: base.y, m: base.m })
    setOpen(true)
  }

  const atMinMonth = view.y === min.y && view.m === min.m
  const prevMonth = () => {
    if (atMinMonth) return
    setView((v) => (v.m === 0 ? { y: v.y - 1, m: 11 } : { y: v.y, m: v.m - 1 }))
  }
  const nextMonth = () => setView((v) => (v.m === 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m: v.m + 1 }))

  const pick = (d) => {
    onChange(toISO(view.y, view.m, d))
    setOpen(false)
  }

  const total = daysInMonth(view.y, view.m)
  const lead = mondayIndex(view.y, view.m, 1)
  const cells = []
  for (let i = 0; i < lead; i++) cells.push(null)
  for (let d = 1; d <= total; d++) cells.push(d)

  // Лейбл «всплывает», когда есть значение или календарь открыт (аналог фокуса).
  const floated = Boolean(selected) || open

  return (
    <div className="ele-field ele-datepicker" ref={ref}>
      <button
        type="button"
        id={id}
        className={'ele-field__box ele-datepicker__box' + (open ? ' ele-field__box--focused' : '')}
        onClick={() => (open ? setOpen(false) : openCalendar())}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className={'ele-datepicker__inner' + (floated ? ' ele-datepicker__inner--floated' : '')}>
          {label ? <span className="ele-field__label">{label}</span> : null}
          {/* Строка значения зарезервирована всегда (nbsp, когда пусто) — чтобы
              высота поля не прыгала при выборе даты. */}
          <span className="ele-datepicker__value">{selected ? formatRu(selected) : ' '}</span>
        </span>
        {selected ? (
          <span
            role="button"
            tabIndex={0}
            title="Очистить"
            className="ele-datepicker__clear"
            onClick={(e) => {
              e.stopPropagation()
              onChange('')
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.stopPropagation()
                onChange('')
              }
            }}
          >
            <Icon name="x" size={15} strokeWidth={2} />
          </span>
        ) : (
          <Icon name="clock" size={17} strokeWidth={1.9} style={{ color: 'var(--color-text-placeholder)', flex: 'none' }} />
        )}
      </button>

      {open ? (
        <div className="ele-cal" role="dialog">
          <div className="ele-cal__head">
            <button
              type="button"
              className="ele-cal__nav"
              onClick={prevMonth}
              disabled={atMinMonth}
              aria-label="Предыдущий месяц"
            >
              <Icon name="chevron-left" size={18} strokeWidth={2} />
            </button>
            <div className="ele-cal__title">
              {MONTHS[view.m]} {view.y}
            </div>
            <button type="button" className="ele-cal__nav" onClick={nextMonth} aria-label="Следующий месяц">
              <Icon name="chevron-right" size={18} strokeWidth={2} />
            </button>
          </div>

          <div className="ele-cal__grid">
            {WEEKDAYS.map((wd, i) => (
              <div key={wd} className={'ele-cal__wd' + (i >= 5 ? ' ele-cal__wd--weekend' : '')}>
                {wd}
              </div>
            ))}
            {cells.map((d, i) => {
              if (d === null) return <div key={`b${i}`} />
              const parts = { y: view.y, m: view.m, d }
              const weekend = mondayIndex(view.y, view.m, d) >= 5
              const disabled = cmp(parts, min) < 0
              const isToday = cmp(parts, today) === 0
              const isSelected = selected && cmp(parts, selected) === 0
              const cls = [
                'ele-cal__day',
                weekend ? 'ele-cal__day--weekend' : '',
                disabled ? 'ele-cal__day--disabled' : '',
                isToday ? 'ele-cal__day--today' : '',
                isSelected ? 'ele-cal__day--selected' : '',
              ]
                .filter(Boolean)
                .join(' ')
              return (
                <button
                  key={d}
                  type="button"
                  className={cls}
                  disabled={disabled}
                  onClick={() => pick(d)}
                >
                  {d}
                </button>
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
}
