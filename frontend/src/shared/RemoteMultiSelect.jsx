import { useEffect, useState } from 'react'
import { apiGet } from './api/client'
import { MultiSelectList } from './ui/MultiSelectList/MultiSelectList.jsx'

// Загрузка списка с эндпоинта + мультивыбор (чек-лист) для модалки фильтров:
// места хранения/рабочие места, здания/помещения/места доступа, операторы,
// поставщики. selected — string[] (id или строковое значение).
//   endpoint  — URL списка (массив или {results});
//   mapOption — item -> { value, label, sub? }.
export function RemoteMultiSelect({ endpoint, mapOption, selected, onChange, search = true, emptyText = 'Ничего не найдено' }) {
  const [data, setData] = useState(null)

  useEffect(() => {
    let alive = true
    apiGet(endpoint)
      .then((d) => alive && setData(Array.isArray(d) ? d : d.results || []))
      .catch(() => alive && setData([]))
    return () => {
      alive = false
    }
  }, [endpoint])

  const options = (data || []).map(mapOption)
  const toggle = (value) =>
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value])

  return (
    <MultiSelectList
      options={options}
      selected={selected}
      onToggle={toggle}
      search={search}
      loading={data === null}
      emptyText={emptyText}
    />
  )
}
