import { useState } from 'react'
import { Banner, Button, Modal } from '../../shared/ui'
import { deactivateUser } from './settingsApi.js'

// — если у Пользователя есть привязанный Сотрудник, уточняем: уволить
// его тоже («Да» — Сотрудник «Уволен» + оборудование откреплено, «Нет» —
// связь снимается, Сотрудник остаётся «Работает»).
export function DeactivateUserModal({ user, onClose, onDone }) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const submit = async (terminateEmployee) => {
    setSubmitting(true)
    setError(null)
    try {
      await deactivateUser(user.id, terminateEmployee)
      onDone()
    } catch (err) {
      setError(err.detail || 'Не удалось деактивировать пользователя.')
      setSubmitting(false)
    }
  }

  if (!user.employee) {
    return (
      <Modal open onClose={onClose} title="Деактивировать пользователя?">
        {error ? <Banner variant="error">{error}</Banner> : null}
        <p style={{ fontSize: 14, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
          Пользователь <b style={{ color: 'var(--color-text-primary)' }}>{user.email}</b> потеряет доступ к системе, все его сессии будут завершены.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 20 }}>
          <Button variant="danger-solid" fullWidth loading={submitting} onClick={() => submit(false)}>
            Деактивировать
          </Button>
          <Button variant="secondary" fullWidth onClick={onClose}>
            Отмена
          </Button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal open onClose={onClose} title="Деактивировать пользователя?">
      {error ? <Banner variant="error">{error}</Banner> : null}
      <p style={{ fontSize: 14, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
        Пользователь <b style={{ color: 'var(--color-text-primary)' }}>{user.email}</b> связан с сотрудником{' '}
        <b style={{ color: 'var(--color-text-primary)' }}>{user.employee_name}</b>. Уволить также связанного сотрудника?
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 20 }}>
        <Button variant="danger-solid" fullWidth loading={submitting} onClick={() => submit(true)}>
          Да, уволить сотрудника
        </Button>
        <Button fullWidth loading={submitting} onClick={() => submit(false)}>
          Нет, оставить работающим
        </Button>
        <Button variant="secondary" fullWidth onClick={onClose}>
          Отмена
        </Button>
      </div>
    </Modal>
  )
}
