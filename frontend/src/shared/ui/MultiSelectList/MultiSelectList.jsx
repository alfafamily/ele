import { useMemo, useState } from 'react'
import { Icon } from '../Icon/Icon.jsx'
import '../FilterButton/FilterButton.css'
import '../FilterModal/FilterModal.css'

// Универсальный мультивыбор для модалки фильтров (типы, места, операторы,
// поставщики, здания/помещения/места доступа, значения реквизита-списка).
//   options  — [{ value, label, sub? }] (value приводим к строке при сравнении);
//   selected — string[]; onToggle(value) — переключение;
//   search   — показывать ли поле поиска над списком;
//   chips    — режим «чипсы»: выбранные показываются чипсами над списком и
//              убираются из списка (как у выбора сотрудников); снятие — по «×».
//              Без chips — обычный чек-лист (галочка остаётся в строке).
export function MultiSelectList({
  options,
  selected,
  onToggle,
  search = false,
  searchPlaceholder = 'Поиск',
  emptyText = 'Ничего не найдено',
  loading = false,
  maxHeight = 216,
  chips = false,
}) {
  const [query, setQuery] = useState('')
  const selectedSet = new Set((selected || []).map(String))

  // В режиме чипсов список показывает только невыбранные варианты.
  const baseOptions = chips ? options.filter((o) => !selectedSet.has(String(o.value))) : options
  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return baseOptions
    return baseOptions.filter((o) => `${o.label} ${o.sub || ''}`.toLowerCase().includes(q))
  }, [baseOptions, query])

  // Выбранные варианты (с подписями из options) — для чипсов; порядок как в selected.
  const selectedOptions = chips
    ? (selected || []).map((v) => options.find((o) => String(o.value) === String(v)) || { value: v, label: String(v) })
    : []
  const allChosen = chips && !loading && options.length > 0 && baseOptions.length === 0

  return (
    <div>
      {chips && selectedOptions.length ? (
        <div className="ele-filter-chips">
          {selectedOptions.map((o) => (
            <span key={o.value} className="ele-filter-chip">
              <span className="ele-filter-chip__label">{o.label}</span>
              <button type="button" className="ele-filter-chip__remove" onClick={() => onToggle(String(o.value))} aria-label="Убрать">
                <Icon name="x" size={13} strokeWidth={2.2} />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      {search ? (
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={searchPlaceholder}
          style={{
            width: '100%',
            height: 40,
            boxShadow: 'inset 0 0 0 1px var(--color-border)',
            borderRadius: 10,
            border: 'none',
            padding: '0 12px',
            fontSize: 13.5,
            fontFamily: 'inherit',
            marginBottom: 8,
          }}
        />
      ) : null}
      <div style={{ border: '1px solid var(--color-border)', borderRadius: 10, overflowY: 'auto', maxHeight, padding: 4 }}>
        {loading ? (
          <div style={{ padding: 12, fontSize: 13, color: 'var(--color-text-placeholder)', textAlign: 'center' }}>Загрузка…</div>
        ) : list.length === 0 ? (
          <div style={{ padding: 12, fontSize: 13, color: 'var(--color-text-placeholder)', textAlign: 'center' }}>
            {allChosen ? 'Все варианты выбраны' : emptyText}
          </div>
        ) : (
          list.map((o) => {
            const checked = !chips && selectedSet.has(String(o.value))
            return (
              <button
                key={o.value}
                type="button"
                role="menuitemcheckbox"
                aria-checked={checked}
                className={'ele-filter-btn__item' + (checked ? ' ele-filter-btn__item--active' : '')}
                style={{ width: '100%' }}
                onClick={() => onToggle(String(o.value))}
              >
                {/* В режиме чипсов строки списка — только невыбранные; вместо
                    рамки-галочки показываем «плюс» (клик добавляет в чипсы). */}
                {chips ? (
                  <span className="ele-filter-btn__check" style={{ color: 'var(--color-text-placeholder)' }}>
                    <Icon name="plus" size={14} strokeWidth={2.4} />
                  </span>
                ) : (
                  <span className="ele-filter-btn__check ele-filter-btn__check--box">
                    {checked ? <Icon name="check" size={13} strokeWidth={2.6} /> : null}
                  </span>
                )}
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.label}</span>
                  {o.sub ? (
                    <span style={{ display: 'block', fontSize: 11.5, fontWeight: 400, color: 'var(--color-text-placeholder)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.sub}</span>
                  ) : null}
                </span>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
