import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AuthShell } from '../auth/AuthShell.jsx'
import { Spinner } from '../../shared/ui'
import { confirmEmailChange } from './profileApi.js'

// Переход по ссылке из письма «Подтверждение смены email» (§4.8, ELE_05).
export function ConfirmEmailChangePage() {
  const { token } = useParams()
  const [state, setState] = useState('pending')
  const [message, setMessage] = useState('')

  useEffect(() => {
    let cancelled = false
    confirmEmailChange(token)
      .then(() => {
        if (!cancelled) setState('ok')
      })
      .catch((err) => {
        if (!cancelled) {
          setState('error')
          setMessage(err.detail || 'Ссылка недействительна или устарела.')
        }
      })
    return () => {
      cancelled = true
    }
  }, [token])

  if (state === 'pending') {
    return (
      <AuthShell>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <Spinner />
        </div>
      </AuthShell>
    )
  }

  const ok = state === 'ok'
  return (
    <AuthShell>
      <div className="ele-auth-icon-circle" style={{ background: ok ? 'var(--color-success-bg)' : 'var(--color-error-bg)' }}>
        {ok ? (
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12l5 5L20 6" />
          </svg>
        ) : (
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="var(--color-error)" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v5M12 16h.01" />
          </svg>
        )}
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 20, fontWeight: 600 }}>{ok ? 'Email изменён' : 'Не удалось подтвердить email'}</div>
        <p className="ele-auth-centered-text" style={{ marginTop: 8 }}>
          {ok ? 'Теперь для входа используйте новый адрес.' : message}
        </p>
      </div>
      <Link to="/login" style={{ textAlign: 'center' }}>
        Перейти ко входу
      </Link>
    </AuthShell>
  )
}
