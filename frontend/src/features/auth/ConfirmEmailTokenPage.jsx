import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiPost } from '../../shared/api/client'
import { Icon, Spinner } from '../../shared/ui'
import { AuthShell } from './AuthShell.jsx'

// Переход по ссылке из письма «Подтверждение email».
export function ConfirmEmailTokenPage() {
  const { token } = useParams()
  const [state, setState] = useState('pending') // pending | ok | error
  const [message, setMessage] = useState('')

  useEffect(() => {
    let cancelled = false
    apiPost('/api/auth/confirm-email/', { token })
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
          <Icon name="check" size={30} strokeWidth={2.2} style={{ color: 'var(--color-success)' }} />
        ) : (
          <Icon name="circle-alert" size={30} strokeWidth={2} style={{ color: 'var(--color-error)' }} />
        )}
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 20, fontWeight: 600 }}>{ok ? 'Почта подтверждена' : 'Не удалось подтвердить почту'}</div>
        <p className="ele-auth-centered-text" style={{ marginTop: 8 }}>
          {ok ? 'Теперь вы можете войти в систему.' : message}
        </p>
      </div>
      <Link to="/login" style={{ textAlign: 'center' }}>
        Перейти ко входу
      </Link>
    </AuthShell>
  )
}
