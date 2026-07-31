import { ConfirmEmailResultPage } from '../auth/ConfirmEmailResultPage.jsx'
import { confirmEmailChange } from './profileApi.js'

// Переход по ссылке из письма «Подтверждение смены email».
export function ConfirmEmailChangePage() {
  return (
    <ConfirmEmailResultPage
      confirmFn={confirmEmailChange}
      successTitle="Email изменён"
      successText="Теперь для входа используйте новый адрес."
      errorTitle="Не удалось подтвердить email"
    />
  )
}
