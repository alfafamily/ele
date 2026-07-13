import './AuthShell.css'

// Общий каркас экранов A1-A3/R1-R3 (§4.1-4.5): по центру, лого ELE сверху,
// заголовок, дальше — содержимое конкретного экрана.
export function AuthShell({ title, subtitle, width, children }) {
  return (
    <div className="ele-auth-shell">
      <div className="ele-auth-card" style={width ? { maxWidth: width } : undefined}>
        <div className="ele-auth-card__logo">
          <img src="/brand/ele-full.svg" alt="ELE" />
        </div>
        {title ? <h1 className="ele-auth-card__title">{title}</h1> : null}
        {subtitle ? <p className="ele-auth-card__subtitle">{subtitle}</p> : null}
        {children}
      </div>
    </div>
  )
}
