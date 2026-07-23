import './RadioPills.css'

// Ряд взаимоисключающих «пилюль»-переключателей (radio) для модалки фильтров:
// статус размещения, тип SIM, вид лицензии, тип средства, категория
// «Закреплён за» и т.п. options: [{ value, label }].
export function RadioPills({ options, value, onChange }) {
  return (
    <div className="ele-radio-pills" role="radiogroup">
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            className={'ele-radio-pill' + (active ? ' ele-radio-pill--active' : '')}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
