import { Icon } from '../Icon/Icon.jsx'
import './Table.css'

// Один и тот же grid-паттерн колонок повторяется во всех списках спеки
// (-5.3) — columns описывает и заголовок, и разметку строк
// (через gridTemplateColumns), чтобы они не могли разъехаться между собой.
export function gridTemplateColumns(columns) {
  return columns.map((c) => c.width || '1fr').join(' ')
}

// Полные "карточки" на мобильных для каждого списка — отдельная задача
// полировки; здесь минимальная защита от обрезанных колонок —
// горизонтальный скролл с сохранённой шириной содержимого.
function minTableWidth(columns) {
  const cols = columns.reduce((sum, c) => sum + (c.width && c.width.endsWith('px') ? parseInt(c.width, 10) : 150), 0)
  return cols + 16 * Math.max(0, columns.length - 1) // + column-gap между колонками (Table.css)
}

// fit — не задавать принудительную минимальную ширину: колонки ужимаются под
// контейнер (mobile-раскладки, где содержимое обрезается многоточием в границах
// колонок вместо горизонтального скролла).
export function Table({ columns, sortKey, sortDir, onSort, fit, children }) {
  return (
    <div className="ele-table">
      <div className="ele-table__scroll">
        <div style={fit ? undefined : { minWidth: minTableWidth(columns) }}>
          <div className="ele-table__head" style={{ gridTemplateColumns: gridTemplateColumns(columns) }}>
            {columns.map((col) => {
              const isActive = col.key === sortKey
              const label = col.sortable ? (
                <button
                  type="button"
                  className="ele-table__sort-btn"
                  onClick={() => onSort?.(col.key)}
                >
                  {col.label}
                  <SortIcon active={isActive} dir={isActive ? sortDir : null} />
                </button>
              ) : (
                col.label
              )
              return (
                <div
                  key={col.key}
                  className={['ele-table__head-cell', isActive ? 'ele-table__head-cell--active' : '']
                    .filter(Boolean)
                    .join(' ')}
                >
                  {label}
                </div>
              )
            })}
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}

export function TableRow({ columns, children, style, ...rest }) {
  // style мержим, а не отдаём в ...rest — иначе переданный style затирал бы
  // gridTemplateColumns и строка «разъезжалась» бы по колонкам.
  return (
    <div className="ele-table__row" style={{ gridTemplateColumns: gridTemplateColumns(columns), ...style }} {...rest}>
      {children}
    </div>
  )
}

function SortIcon({ active, dir }) {
  if (!active) {
    return <Icon name="chevrons-up-down" size={12} strokeWidth={2} style={{ color: '#C7C9D4' }} />
  }
  // asc — стрелка вниз, desc — стрелка вверх (сохраняем прежнее направление).
  return <Icon name={dir === 'asc' ? 'arrow-down' : 'arrow-up'} size={12} strokeWidth={2.4} style={{ color: '#1C1C21' }} />
}
