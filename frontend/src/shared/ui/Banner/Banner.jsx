import './Banner.css'

const ICONS = { error: '!', warning: '!', success: '✓', info: 'i' }

// Сводный баннер над формой при ошибке валидации, плюс переиспользуем
// для нейтральных/успешных сообщений (напр. R3 «Если аккаунт существует…»).
export function Banner({ variant = 'error', children }) {
  return (
    <div className={`ele-banner ele-banner--${variant}`}>
      <span className="ele-banner__icon" aria-hidden>
        {ICONS[variant]}
      </span>
      <div>{children}</div>
    </div>
  )
}
