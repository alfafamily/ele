import './Checkbox.css'

export function Checkbox({ label, checked, onChange, disabled, ...rest }) {
  return (
    <label className="ele-checkbox">
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange?.(e.target.checked)} disabled={disabled} {...rest} />
      <span className="ele-checkbox__box">
        {checked ? (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12l5 5L20 6" />
          </svg>
        ) : null}
      </span>
      {label}
    </label>
  )
}
