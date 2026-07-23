import { useEffect, useState } from 'react'
import { apiGet } from './api/client'
import { MultiSelectList } from './ui/MultiSelectList/MultiSelectList.jsx'
import { RequisiteAutocompleteChips } from './RequisiteAutocompleteChips.jsx'
import './ui/FilterModal/FilterModal.css'

// B27. Блок фильтра «Тип + реквизиты» (Оборудование/Лицензии). Мультивыбор типов
// (чипсы); по каждому выбранному типу — подблок с фильтрами его реквизитов (кроме
// файловых). Каждый реквизит — мультизначный (ИЛИ внутри реквизита):
//   список / Да-Нет  — выбор вариантов чипсами (MultiSelectList);
//   текст / число     — автоподсказка существующих значений чипсами.
//   endpoint   — '/api/equipment-types/' | '/api/license-types/' (список отдаёт fields);
//   valuesBase — '/api/equipment/field-values/' | '/api/licenses/field-values/'
//                (эндпоинт подсказок значений реквизита);
//   types — string[] id выбранных типов; req — { [fieldId]: string[] }.
const toggle = (arr, v) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v])
const BOOL_OPTIONS = [
  { value: 'true', label: 'Да' },
  { value: 'false', label: 'Нет' },
]

function ReqFieldControl({ field, value, onChange, valuesBase }) {
  if (field.value_type === 'bool') {
    return <MultiSelectList options={BOOL_OPTIONS} selected={value} onToggle={(v) => onChange(toggle(value, v))} chips />
  }
  if (field.value_type === 'list') {
    const options = (field.options || []).map((o) => ({ value: o.value, label: o.value }))
    return <MultiSelectList options={options} selected={value} onToggle={(v) => onChange(toggle(value, v))} search={options.length > 6} chips />
  }
  const numeric = field.value_type === 'int' || field.value_type === 'float'
  return <RequisiteAutocompleteChips value={value} onChange={onChange} valuesUrl={`${valuesBase}?field=${field.id}`} numeric={numeric} />
}

export function TypeRequisiteFilter({ endpoint, valuesBase, label = 'Тип', types, onTypesChange, req, onReqChange }) {
  const [allTypes, setAllTypes] = useState(null)

  useEffect(() => {
    let alive = true
    apiGet(endpoint)
      .then((d) => alive && setAllTypes(Array.isArray(d) ? d : d.results || []))
      .catch(() => alive && setAllTypes([]))
    return () => {
      alive = false
    }
  }, [endpoint])

  const options = (allTypes || []).map((t) => ({ value: String(t.id), label: t.name }))
  const selectedTypes = (allTypes || []).filter((t) => types.includes(String(t.id)))

  const toggleType = (id) => {
    if (types.includes(id)) {
      onTypesChange(types.filter((t) => t !== id))
      // Снятый тип — чистим значения его реквизитов из req.
      const t = (allTypes || []).find((x) => String(x.id) === id)
      if (t && (t.fields || []).length) {
        const next = { ...req }
        for (const f of t.fields) delete next[f.id]
        onReqChange(next)
      }
    } else {
      onTypesChange([...types, id])
    }
  }

  const setReqValue = (fieldId, values) => {
    const next = { ...req }
    if (!values || values.length === 0) delete next[fieldId]
    else next[fieldId] = values
    onReqChange(next)
  }

  return (
    <div>
      <div className="ele-filter-section__title">{label}</div>
      <MultiSelectList options={options} selected={types} onToggle={toggleType} search loading={allTypes === null} chips />
      {selectedTypes.map((t) => {
        const fields = (t.fields || []).filter((f) => f.value_type !== 'file')
        if (!fields.length) return null
        return (
          <div key={t.id} className="ele-filter-subgroup" style={{ marginTop: 12 }}>
            <div className="ele-filter-subgroup__title">{t.name}</div>
            {fields.map((f) => (
              <div key={f.id}>
                <div className="ele-filter-section__title">{f.name}</div>
                <ReqFieldControl field={f} value={Array.isArray(req[f.id]) ? req[f.id] : []} onChange={(vals) => setReqValue(f.id, vals)} valuesBase={valuesBase} />
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
