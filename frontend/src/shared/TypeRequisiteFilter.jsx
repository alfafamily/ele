import { useEffect, useState } from 'react'
import { apiGet } from './api/client'
import { MultiSelectList } from './ui/MultiSelectList/MultiSelectList.jsx'
import { FieldValueInput } from './eav/FieldValueInput.jsx'
import './ui/FilterModal/FilterModal.css'

// B27. Блок фильтра «Тип + реквизиты» (Оборудование/Лицензии). Мультивыбор типов;
// по каждому выбранному типу — подблок с полями его реквизитов (кроме файловых).
//   endpoint — '/api/equipment-types/' | '/api/license-types/' (список уже отдаёт
//              fields с options);
//   types    — string[] id выбранных типов; onTypesChange(next);
//   req      — { [fieldId]: value }; onReqChange(next).
export function TypeRequisiteFilter({ endpoint, label = 'Тип', types, onTypesChange, req, onReqChange }) {
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

  const setReqValue = (fieldId, value) => {
    const next = { ...req }
    if (value === null || value === undefined || value === '') delete next[fieldId]
    else next[fieldId] = value
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
              <FieldValueInput
                key={f.id}
                field={{ ...f, is_required: false }}
                value={req[f.id] ?? null}
                onChange={(v) => setReqValue(f.id, v)}
              />
            ))}
          </div>
        )
      })}
    </div>
  )
}
