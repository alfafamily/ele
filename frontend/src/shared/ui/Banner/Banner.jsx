import { Icon } from '../Icon/Icon.jsx'
import './Banner.css'

const ICONS = { error: 'circle-alert', warning: 'triangle-alert', success: 'circle-check', info: 'info' }

// Сводный баннер над формой при ошибке валидации, плюс переиспользуем
// для нейтральных/успешных сообщений (напр. R3 «Если аккаунт существует…»).
export function Banner({ variant = 'error', children }) {
  return (
    <div className={`ele-banner ele-banner--${variant}`}>
      <span className="ele-banner__icon" aria-hidden>
        <Icon name={ICONS[variant]} size={18} strokeWidth={1.9} />
      </span>
      <div>{children}</div>
    </div>
  )
}
