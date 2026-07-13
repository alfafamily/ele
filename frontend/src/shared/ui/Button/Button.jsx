import './Button.css'

export function Button({
  variant = 'primary',
  loading = false,
  disabled = false,
  fullWidth = false,
  type = 'button',
  className = '',
  children,
  ...rest
}) {
  const classes = ['ele-btn', `ele-btn--${variant}`, fullWidth ? 'ele-btn--full' : '', className]
    .filter(Boolean)
    .join(' ')
  return (
    <button type={type} className={classes} disabled={disabled || loading} aria-busy={loading} {...rest}>
      {loading ? <span className="ele-btn__spinner" aria-hidden /> : null}
      {children}
    </button>
  )
}
