import { useState } from 'react'
import { Banner, Button, Input, Modal } from '../../shared/ui'
import { changePassword } from './profileApi.js'

export function ChangePasswordModal({ onClose, onDone }) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newPasswordRepeat, setNewPasswordRepeat] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})

  const submit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    setFieldErrors({})
    try {
      await changePassword({
        current_password: currentPassword,
        new_password: newPassword,
        new_password_repeat: newPasswordRepeat,
      })
      onDone()
    } catch (err) {
      if (err.errors) setFieldErrors(err.errors)
      else setError(err.detail || 'Не удалось сменить пароль.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Смена пароля">
      {error ? <Banner variant="error">{error}</Banner> : null}
      {fieldErrors.non_field_errors ? <Banner variant="error">{fieldErrors.non_field_errors.join(' ')}</Banner> : null}
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Input
          label="Текущий пароль"
          required
          showToggle
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          error={fieldErrors.current_password}
        />
        <Input
          label="Новый пароль"
          required
          showToggle
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          error={fieldErrors.new_password}
        />
        <Input
          label="Повторите новый пароль"
          required
          showToggle
          autoComplete="new-password"
          value={newPasswordRepeat}
          onChange={(e) => setNewPasswordRepeat(e.target.value)}
          error={fieldErrors.new_password_repeat}
          helperText={!fieldErrors.new_password_repeat ? 'Минимум 8 символов: строчные и прописные буквы, цифры, спецсимволы.' : undefined}
        />
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
          <Button type="button" variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" loading={submitting}>
            Сохранить пароль
          </Button>
        </div>
      </form>
    </Modal>
  )
}
