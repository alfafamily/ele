import { useState } from 'react'
import { Banner, Button, Input, Modal } from '../../shared/ui'
import { requestEmailChange } from './profileApi.js'

// Смена email из Профиля: ссылка уходит на НОВЫЙ адрес, сам
// email меняется только по переходу (ConfirmEmailChangePage).
export function ChangeEmailModal({ onClose }) {
  const [newEmail, setNewEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [sent, setSent] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await requestEmailChange(newEmail)
      setSent(true)
    } catch (err) {
      setError(err.errors ? Object.values(err.errors).flat().join(' ') : err.detail || 'Не удалось отправить письмо.')
    } finally {
      setSubmitting(false)
    }
  }

  if (sent) {
    return (
      <Modal open onClose={onClose} title="Проверьте почту">
        <p style={{ fontSize: 14, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
          Мы отправили ссылку для подтверждения на <b style={{ color: 'var(--color-text-primary)' }}>{newEmail}</b>. Email
          изменится после перехода по ней.
        </p>
        <Button fullWidth style={{ marginTop: 18 }} onClick={onClose}>
          Понятно
        </Button>
      </Modal>
    )
  }

  return (
    <Modal open onClose={onClose} title="Смена email">
      {error ? <Banner variant="error">{error}</Banner> : null}
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Input label="Новый email" type="email" required value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Button type="button" variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" loading={submitting}>
            Отправить ссылку
          </Button>
        </div>
      </form>
    </Modal>
  )
}
