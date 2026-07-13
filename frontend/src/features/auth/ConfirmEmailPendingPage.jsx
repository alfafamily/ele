import { useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { apiPost } from '../../shared/api/client'
import { Button } from '../../shared/ui'
import { AuthShell } from './AuthShell.jsx'

const RESEND_COOLDOWN = 60

// R2 — экран сразу после самостоятельной регистрации (§4.2): ссылка ушла на
// почту, здесь только повторная отправка с таймером.
export function ConfirmEmailPendingPage() {
  const location = useLocation()
  const email = location.state?.email
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setInterval(() => setCooldown((v) => Math.max(0, v - 1)), 1000)
    return () => clearInterval(timer)
  }, [cooldown])

  if (!email) return <Navigate to="/login" replace />

  const resend = async () => {
    setSending(true)
    try {
      await apiPost('/api/auth/resend-confirmation/', { email })
      setCooldown(RESEND_COOLDOWN)
    } finally {
      setSending(false)
    }
  }

  return (
    <AuthShell>
      <div className="ele-auth-icon-circle" style={{ background: 'var(--color-info-bg)' }}>
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="var(--color-info)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M3 7l9 6 9-6" />
        </svg>
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 20, fontWeight: 600 }}>Подтвердите почту</div>
        <p className="ele-auth-centered-text" style={{ marginTop: 8 }}>
          Мы отправили ссылку на <b style={{ color: 'var(--color-text-primary)' }}>{email}</b>. Перейдите по ней,
          чтобы активировать аккаунт.
        </p>
      </div>
      <Button variant="secondary" fullWidth loading={sending} disabled={cooldown > 0} onClick={resend}>
        Отправить ссылку повторно
      </Button>
      {cooldown > 0 ? (
        <div className="ele-auth-centered-text" style={{ fontSize: 12.5 }}>
          Повторная отправка через {String(Math.floor(cooldown / 60)).padStart(2, '0')}:
          {String(cooldown % 60).padStart(2, '0')}
        </div>
      ) : null}
    </AuthShell>
  )
}
