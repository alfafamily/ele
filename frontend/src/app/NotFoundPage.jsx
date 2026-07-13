import { useNavigate } from 'react-router-dom'
import { Button } from '../shared/ui'
import './ErrorPage.css'

// 404 (§5.9) — код, пояснение, «Назад»/«На главную».
export function NotFoundPage() {
  const navigate = useNavigate()
  return (
    <div className="ele-error-shell">
      <div className="ele-error-card">
        <div className="ele-error-card__code">404</div>
        <div className="ele-error-card__bar" style={{ background: 'var(--color-brand-accent)' }} />
        <div className="ele-error-card__title">Страница не найдена</div>
        <div className="ele-error-card__description">Возможно, объект был перемещён в архив или ссылка устарела.</div>
        <div className="ele-error-card__actions">
          <Button variant="secondary" onClick={() => navigate(-1)}>
            Назад
          </Button>
          <Button onClick={() => navigate('/')}>На главную</Button>
        </div>
      </div>
    </div>
  )
}
