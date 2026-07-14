import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiPost } from '../../shared/api/client'
import { Button, Input } from '../../shared/ui'
import { AuthShell } from './AuthShell.jsx'

const RESEND_COOLDOWN = 60

// R3 → R3·2: нейтральный ответ независимо от того, существует ли
// аккаунт — не палим факт существования учётной записи.
export function PasswordResetRequestPage() {
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setInterval(() => setCooldown((v) => Math.max(0, v - 1)), 1000)
    return () => clearInterval(timer)
  }, [cooldown])

  const submit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      await apiPost('/api/auth/password-reset/', { email })
      setSent(true)
      setCooldown(RESEND_COOLDOWN)
    } finally {
      setSubmitting(false)
    }
  }

  if (sent) {
    return (
      <AuthShell>
        <div className="ele-auth-icon-circle" style={{ background: 'var(--color-success-bg)' }}>
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="M3 7l9 6 9-6" />
          </svg>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 600 }}>Проверьте почту</div>
          <p className="ele-auth-centered-text" style={{ marginTop: 8 }}>
            Если аккаунт с адресом <b style={{ color: 'var(--color-text-primary)' }}>{email}</b> существует, на него
            отправлена ссылка для сброса пароля.
          </p>
        </div>
        <Button variant="secondary" fullWidth disabled={cooldown > 0} loading={submitting} onClick={submit}>
          Отправить повторно
        </Button>
        {cooldown > 0 ? (
          <div className="ele-auth-centered-text" style={{ fontSize: 12.5 }}>
            Повторная отправка через {String(Math.floor(cooldown / 60)).padStart(2, '0')}:
            {String(cooldown % 60).padStart(2, '0')}
          </div>
        ) : null}
        <div className="ele-auth-card__footer">
          <Link to="/login">← Вернуться ко входу</Link>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell title="Восстановление пароля" subtitle="Укажите email — вышлем ссылку для сброса пароля.">
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Input label="Email" type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Button type="submit" fullWidth loading={submitting}>
          Отправить ссылку
        </Button>
      </form>
      <div className="ele-auth-card__footer">
        <Link to="/login">← Вернуться ко входу</Link>
      </div>
    </AuthShell>
  )
}
