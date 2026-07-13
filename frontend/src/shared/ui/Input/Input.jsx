import { useId, useState } from 'react'
import './Input.css'

// Единый паттерн полей форм (§8.5 «Валидация форм»): невалидное поле —
// заливка/контур в цвете ошибки + текст ошибки под полем.
export function Input({
  label,
  required = false,
  error,
  helperText,
  type = 'text',
  showToggle = false,
  className = '',
  id,
  ...rest
}) {
  const autoId = useId()
  const inputId = id || autoId
  const [focused, setFocused] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const errorText = Array.isArray(error) ? error[0] : error
  const resolvedType = showToggle ? (revealed ? 'text' : 'password') : type

  const boxClasses = [
    'ele-field__box',
    errorText ? 'ele-field__box--error' : '',
    focused ? 'ele-field__box--focused' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={['ele-field', className].filter(Boolean).join(' ')}>
      <div className={boxClasses}>
        <div className="ele-field__inner">
          {label ? (
            <label className="ele-field__label" htmlFor={inputId}>
              {label} {required ? <span className="ele-field__required">*</span> : null}
            </label>
          ) : null}
          <input
            id={inputId}
            className="ele-field__input"
            type={resolvedType}
            aria-invalid={Boolean(errorText)}
            {...rest}
            onFocus={(e) => {
              setFocused(true)
              rest.onFocus?.(e)
            }}
            onBlur={(e) => {
              setFocused(false)
              rest.onBlur?.(e)
            }}
          />
        </div>
        {showToggle ? (
          <button
            type="button"
            className="ele-field__toggle"
            onClick={() => setRevealed((v) => !v)}
            tabIndex={-1}
          >
            {revealed ? 'Скрыть' : 'Показать'}
          </button>
        ) : null}
      </div>
      {errorText ? (
        <div className="ele-field__error-text">{errorText}</div>
      ) : helperText ? (
        <div className="ele-field__helper">{helperText}</div>
      ) : null}
    </div>
  )
}
