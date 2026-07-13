import { useCallback, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiPost } from '../../shared/api/client'
import { Banner, Button, Input } from '../../shared/ui'
import { AuthShell } from './AuthShell.jsx'

// Самостоятельная регистрация (§4.2). Поле «ФИО» присутствует в макете, но
// сознательно не отправляется на сервер — не входит в модель Пользователя
// (ТЗ §3.2, примечание).
export function RegisterPage() {
  const navigate = useNavigate()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
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
        await apiPost('/api/auth/register/', { email, password, password_repeat: passwordRepeat })
        navigate('/confirm-email', { state: { email } })
      } catch (err) {
        if (err.errors) setErrors(err.errors)
        else setFormError(err.detail || 'Не удалось зарегистрироваться.')
      } finally {
        setSubmitting(false)
      }
    },
    [email, password, passwordRepeat, navigate]
  )

  return (
    <AuthShell title="Регистрация">
      {formError ? <Banner variant="error">{formError}</Banner> : null}
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Input label="ФИО" value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" />
        <Input
          label="Email"
          type="email"
          required
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
        />
        <Input
          label="Пароль"
          required
          showToggle
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
        />
        <Input
          label="Повторите пароль"
          required
          showToggle
          autoComplete="new-password"
          value={passwordRepeat}
          onChange={(e) => setPasswordRepeat(e.target.value)}
          error={errors.password_repeat}
        />
        <Button type="submit" fullWidth loading={submitting}>
          Зарегистрироваться
        </Button>
      </form>
      <div className="ele-auth-card__footer">
        Уже есть аккаунт? <Link to="/login">Войти</Link>
      </div>
    </AuthShell>
  )
}
