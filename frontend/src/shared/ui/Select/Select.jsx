import { useId } from 'react'
import '../Input/Input.css'

// Тот же визуальный паттерн, что и Input (filled box + label сверху), но
// нативный <select> — для простых перечислений (Тип, Роль, тип значения
// реквизита). Для подбора с поиском (Сотрудник, Лицензия) — отдельные
// комбобоксы в конкретных фичах, не этот примитив.
export function Select({ label, required = false, error, value, onChange, children, id, placeholder, className = '', ...rest }) {
  const autoId = useId()
  const selectId = id || autoId
  const errorText = Array.isArray(error) ? error[0] : error

  const boxClasses = ['ele-field__box', errorText ? 'ele-field__box--error' : ''].filter(Boolean).join(' ')

  return (
    <div className={['ele-field', className].filter(Boolean).join(' ')}>
      <div className={boxClasses}>
        <div className="ele-field__inner">
          {label ? (
            <label className="ele-field__label" htmlFor={selectId}>
              {label} {required ? <span className="ele-field__required">*</span> : null}
            </label>
          ) : null}
          <select
            id={selectId}
            className="ele-field__input"
            style={{ cursor: 'pointer' }}
            value={value ?? ''}
            onChange={(e) => onChange?.(e.target.value)}
            {...rest}
          >
            {placeholder ? <option value="">{placeholder}</option> : null}
            {children}
          </select>
        </div>
      </div>
      {errorText ? <div className="ele-field__error-text">{errorText}</div> : null}
    </div>
  )
}
