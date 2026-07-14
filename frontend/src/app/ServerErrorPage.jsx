import { Button } from '../shared/ui'
import './ErrorPage.css'

// 500 — код, пояснение, «На главную»/«Обновить». Рендерится
// ErrorBoundary'ем при непойманной ошибке рендера (см. app/ErrorBoundary.jsx).
export function ServerErrorPage() {
  return (
    <div className="ele-error-shell">
      <div className="ele-error-card">
        <div className="ele-error-card__code">500</div>
        <div className="ele-error-card__bar" style={{ background: 'var(--color-error)' }} />
        <div className="ele-error-card__title">Что-то пошло не так</div>
        <div className="ele-error-card__description">
          Внутренняя ошибка сервера. Мы уже уведомлены. Попробуйте обновить страницу или вернуться позже.
        </div>
        <div className="ele-error-card__actions">
          <Button variant="secondary" onClick={() => window.location.assign('/')}>
            На главную
          </Button>
          <Button onClick={() => window.location.reload()}>Обновить</Button>
        </div>
      </div>
    </div>
  )
}
