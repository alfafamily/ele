import { EmployeePicker } from './EmployeePicker.jsx'
import { Icon } from './ui/Icon/Icon.jsx'
import './ui/FilterModal/FilterModal.css'

// Мультивыбор сотрудников для фильтров: чипы выбранных + поиск (EmployeePicker).
// value — [{ id, label }] (label храним, чтобы рисовать чипы без дозапроса).
export function EmployeeMultiPicker({ value = [], onChange, equipmentTypeIds }) {
  const ids = value.map((v) => v.id)
  const add = (emp) => {
    if (!ids.includes(emp.id)) onChange([...value, { id: emp.id, label: emp.full_name }])
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
      <EmployeePicker onSelect={add} excludeIds={ids} withPlus equipmentTypeIds={equipmentTypeIds} />
    </div>
  )
}
