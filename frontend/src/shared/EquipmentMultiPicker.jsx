import { EquipmentPicker } from './EquipmentPicker.jsx'
import { Icon } from './ui/Icon/Icon.jsx'
import './ui/FilterModal/FilterModal.css'

// Мультивыбор оборудования для фильтров: чипы выбранных + поиск (EquipmentPicker).
// value — [{ id, label }] (label = «Тип · Модель», рисуем чипы без дозапроса).
export function EquipmentMultiPicker({ value = [], onChange }) {
  const ids = value.map((v) => v.id)
  const add = (eq) => {
    if (!ids.includes(eq.id)) onChange([...value, { id: eq.id, label: eq.type_and_model }])
  }
  const remove = (id) => onChange(value.filter((v) => v.id !== id))

  return (
    <div>
      {value.length ? (
        <div className="ele-filter-chips">
          {value.map((v) => (
            <span key={v.id} className="ele-filter-chip">
              <span className="ele-filter-chip__label">{v.label}</span>
              <button type="button" className="ele-filter-chip__remove" onClick={() => remove(v.id)} aria-label="Убрать">
                <Icon name="x" size={13} strokeWidth={2.2} />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <EquipmentPicker onSelect={add} excludeIds={ids} withPlus />
    </div>
  )
}
