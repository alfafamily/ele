import { useEffect, useState } from 'react'
import { apiGet } from './api/client'
import { useDebouncedValue } from './hooks/useDebouncedValue'
import { Icon } from './ui/Icon/Icon.jsx'
import './ui/FilterButton/FilterButton.css'
import './ui/FilterModal/FilterModal.css'

// B27. Фильтр текст/число-реквизита: чипсы выбранных значений + инпут с
// автоподсказкой существующих значений (поиск по объектам). Клик по подсказке
// добавляет чипс; можно несколько (ИЛИ). value — массив строк.
//   valuesUrl — базовый URL подсказок с уже подставленным ?field=<id>;
//   numeric   — числовой инпут (целое/дробное).
export function RequisiteAutocompleteChips({ value = [], onChange, valuesUrl, numeric = false }) {
  const [query, setQuery] = useState('')
  const debounced = useDebouncedValue(query, 250)
  const [suggestions, setSuggestions] = useState([])
  const [focused, setFocused] = useState(false)

  // Подсказки ищем и показываем только после ввода — на пустой строке список
  // не раскрываем (чтобы не вываливать сразу все существующие значения).
  const term = debounced.trim()
  useEffect(() => {
    if (!term) {
      setSuggestions([])
      return
    }
    let alive = true
    apiGet(`${valuesUrl}&search=${encodeURIComponent(term)}`)
      .then((d) => alive && setSuggestions(Array.isArray(d) ? d : []))
      .catch(() => alive && setSuggestions([]))
    return () => {
      alive = false
    }
  }, [term, valuesUrl])

  const selectedSet = new Set(value.map(String))
  const shown = suggestions.filter((s) => !selectedSet.has(String(s)))

  const add = (s) => {
    if (!selectedSet.has(String(s))) onChange([...value, String(s)])
    setQuery('')
  }
  const remove = (s) => onChange(value.filter((v) => String(v) !== String(s)))

  return (
    <div>
      {value.length ? (
        <div className="ele-filter-chips">
          {value.map((v) => (
            <span key={v} className="ele-filter-chip">
              <span className="ele-filter-chip__label">{v}</span>
              <button
                type="button"
                className="ele-filter-chip__remove"
                onMouseDown={(e) => {
                  e.preventDefault()
                  remove(v)
                }}
                aria-label="Убрать"
              >
                <Icon name="x" size={13} strokeWidth={2.2} />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <input
        type={numeric ? 'number' : 'text'}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        placeholder="Начните вводить значение"
        style={{
          width: '100%',
          height: 40,
          boxShadow: 'inset 0 0 0 1px var(--color-border)',
          borderRadius: 10,
          border: 'none',
          padding: '0 12px',
          fontSize: 13.5,
          fontFamily: 'inherit',
        }}
      />
      {focused && shown.length ? (
        <div style={{ marginTop: 6, border: '1px solid var(--color-border)', borderRadius: 10, overflowY: 'auto', maxHeight: 176, padding: 4 }}>
          {shown.map((s) => (
            <button
              key={s}
              type="button"
              className="ele-filter-btn__item"
              style={{ width: '100%' }}
              onMouseDown={(e) => {
                e.preventDefault()
                add(s)
              }}
            >
              <span className="ele-filter-btn__check" style={{ color: 'var(--color-text-placeholder)' }}>
                <Icon name="plus" size={14} strokeWidth={2.4} />
              </span>
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
