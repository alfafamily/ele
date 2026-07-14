import './Table.css'

// Один и тот же grid-паттерн колонок повторяется во всех списках спеки
// (§5.1-5.3, §5.5.2) — columns описывает и заголовок, и разметку строк
// (через gridTemplateColumns), чтобы они не могли разъехаться между собой.
export function gridTemplateColumns(columns) {
  return columns.map((c) => c.width || '1fr').join(' ')
}

// Полные "карточки" на мобильных для каждого списка — отдельная задача
// полировки (§8.5); здесь минимальная защита от обрезанных колонок —
// горизонтальный скролл с сохранённой шириной содержимого.
function minTableWidth(columns) {
  const cols = columns.reduce((sum, c) => sum + (c.width && c.width.endsWith('px') ? parseInt(c.width, 10) : 150), 0)
  return cols + 16 * Math.max(0, columns.length - 1) // + column-gap между колонками (Table.css)
}

export function Table({ columns, sortKey, sortDir, onSort, children }) {
  return (
    <div className="ele-table">
      <div className="ele-table__scroll">
        <div style={{ minWidth: minTableWidth(columns) }}>
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
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#C7C9D4" strokeWidth="2">
        <path d="M8 9l4-4 4 4M8 15l4 4 4-4" />
      </svg>
    )
  }
  const path = dir === 'asc' ? 'M6 13l6 6 6-6' : 'M6 11l6-6 6 6'
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#1C1C21" strokeWidth="2.4">
      <path d={`M12 5v14${dir === 'asc' ? '' : ''}`} />
      <path d={path} />
    </svg>
  )
}
