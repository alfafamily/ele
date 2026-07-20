import { useCallback, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../app/AuthContext.jsx'
import { apiPost } from '../../shared/api/client'
import { Banner, Button, Input } from '../../shared/ui'
import { AuthShell } from './AuthShell.jsx'

// Самостоятельная регистрация. Фамилия/Имя обязательны — при регистрации
// на сервере заводится связанный Сотрудник; Отдел/Должность — по желанию.
export function RegisterPage() {
  const navigate = useNavigate()
  const { bootstrap } = useAuth()
  const [lastName, setLastName] = useState('')
  const [firstName, setFirstName] = useState('')
  const [department, setDepartment] = useState('')
  const [position, setPosition] = useState('')
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
        await apiPost('/api/auth/register/', {
          email,
          password,
          password_repeat: passwordRepeat,
          last_name: lastName,
          first_name: firstName,
          department,
          position,
        })
        navigate('/confirm-email', { state: { email } })
      } catch (err) {
        if (err.errors) setErrors(err.errors)
        else setFormError(err.detail || 'Не удалось зарегистрироваться.')
      } finally {
        setSubmitting(false)
      }
    },
    [email, password, passwordRepeat, lastName, firstName, department, position, navigate]
  )

  // B14: регистрация закрыта администратором — форму не показываем.
  if (bootstrap?.registration_open === false) {
    return (
      <AuthShell title="Регистрация недоступна">
        <div className="ele-auth-centered-text">
          Открытая регистрация недоступна, обратитесь к администратору или руководителю.
        </div>
        <div className="ele-auth-card__footer">
          Уже есть аккаунт? <Link to="/login">Войти</Link>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell title="Регистрация">
      {formError ? <Banner variant="error">{formError}</Banner> : null}
      {errors.non_field_errors ? <Banner variant="error">{errors.non_field_errors.join(' ')}</Banner> : null}
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Input
          label="Фамилия"
          required
          autoComplete="family-name"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          error={errors.last_name}
        />
        <Input
          label="Имя"
          required
          autoComplete="given-name"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          error={errors.first_name}
        />
        <Input
          label="Отдел"
          autoComplete="off"
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
          error={errors.department}
        />
        <Input
          label="Должность"
          autoComplete="organization-title"
          value={position}
          onChange={(e) => setPosition(e.target.value)}
          error={errors.position}
        />
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
