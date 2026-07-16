import { Icon } from '../Icon/Icon.jsx'
import './Checkbox.css'

export function Checkbox({ label, checked, onChange, disabled, ...rest }) {
  return (
    <label className="ele-checkbox">
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange?.(e.target.checked)} disabled={disabled} {...rest} />
      <span className="ele-checkbox__box">
        {checked ? <Icon name="check" size={12} strokeWidth={3} style={{ color: '#fff' }} /> : null}
      </span>
      {label}
    </label>
  )
}
