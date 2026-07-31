import { apiPost } from '../../shared/api/client'
import { ConfirmEmailResultPage } from './ConfirmEmailResultPage.jsx'

// Стабильная ссылка (вне компонента) — иначе эффект подтверждения перезапускался
// бы на каждый рендер.
const confirmEmailToken = (token) => apiPost('/api/auth/confirm-email/', { token })

// Переход по ссылке из письма «Подтверждение email».
export function ConfirmEmailTokenPage() {
  return (
    <ConfirmEmailResultPage
      confirmFn={confirmEmailToken}
      successTitle="Почта подтверждена"
      successText="Теперь вы можете войти в систему."
      errorTitle="Не удалось подтвердить почту"
    />
  )
}
