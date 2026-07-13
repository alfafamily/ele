import { useCallback, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { apiPost } from '../../shared/api/client'
import { Banner, Button, Input } from '../../shared/ui'
import { AuthShell } from './AuthShell.jsx'

const MODE_CONFIG = {
  reset: {
    endpoint: '/api/auth/password-reset/confirm/',
    title: 'Новый пароль',
    successMessage: 'Пароль изменён — теперь можно войти.',
  },
  invite: {
    endpoint: '/api/auth/accept-invite/',
    title: 'Установите пароль',
    successMessage: 'Пароль установлен — теперь можно войти.',
  },
}

// Общая форма для ссылки восстановления (§4.5) и завершения приглашения
// (§4.4) — обе строятся на одном uid+token механизме (SetPasswordConfirmSerializer
// на бэкенде), ни один из двух эндпоинтов сам не логинит пользователя.
export function SetPasswordPage({ mode }) {
  const { uid, token } = useParams()
  const navigate = useNavigate()
  const config = MODE_CONFIG[mode]

  const [password, setPassword] = useState('')
  const [passwordRepeat, setPasswordRepeat] = useState('')
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault()
      setErrors({})
      setFormError(null)
      setSubmitting(true)
      try {
        await apiPost(config.endpoint, {
          uid,
          token,
          new_password: password,
          new_password_repeat: passwordRepeat,
        })
        navigate('/login', { replace: true, state: { message: config.successMessage } })
      } catch (err) {
        if (err.errors) setErrors(err.errors)
        else setFormError(err.detail || 'Не удалось сохранить пароль.')
      } finally {
        setSubmitting(false)
      }
    },
    [config, uid, token, password, passwordRepeat, navigate]
  )

  return (
    <AuthShell title={config.title}>
      {formError ? <Banner variant="error">{formError}</Banner> : null}
      {errors.non_field_errors ? <Banner variant="error">{errors.non_field_errors.join(' ')}</Banner> : null}
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Input
          label="Новый пароль"
          required
          showToggle
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.new_password}
        />
        <Input
          label="Повторите новый пароль"
          required
          showToggle
          autoComplete="new-password"
          value={passwordRepeat}
          onChange={(e) => setPasswordRepeat(e.target.value)}
          error={errors.new_password_repeat}
          helperText={!errors.new_password_repeat ? 'Минимум 8 символов: строчные и прописные буквы, цифры, спецсимволы.' : undefined}
        />
        {errors.token ? <Banner variant="error">{errors.token[0]}</Banner> : null}
        <Button type="submit" fullWidth loading={submitting}>
          Сохранить пароль
        </Button>
      </form>
    </AuthShell>
  )
}
