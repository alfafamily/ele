import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../app/AuthContext.jsx'
import { Banner, Button, Icon, Input } from '../../shared/ui'
import { AuthShell } from './AuthShell.jsx'
import { SmartCaptcha } from './SmartCaptcha.jsx'

const YANDEX_ERROR_MESSAGES = {
  disabled: 'Вход через Яндекс ID сейчас недоступен.',
  state: 'Сессия входа через Яндекс ID устарела, попробуйте ещё раз.',
  token: 'Не удалось подтвердить вход через Яндекс ID.',
  email: 'Яндекс ID не вернул email — вход невозможен.',
  domain: 'Домен email не совпадает с доменом компании.',
  inactive: 'Учётная запись деактивирована.',
}

function formatCountdown(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function LoginPage() {
  const { login, bootstrap } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [captchaToken, setCaptchaToken] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState(null)
  const [captchaRequired, setCaptchaRequired] = useState(false)
  const [attemptsRemaining, setAttemptsRemaining] = useState(null)
  const [retryAfter, setRetryAfter] = useState(0)

  const successMessage = location.state?.message
  const yandexErrorParam = new URLSearchParams(location.search).get('yandex_error')

  useEffect(() => {
    if (retryAfter <= 0) return
    const timer = setInterval(() => setRetryAfter((v) => Math.max(0, v - 1)), 1000)
    return () => clearInterval(timer)
  }, [retryAfter])

  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault()
      setFormError(null)
      setSubmitting(true)
      try {
        await login(email, password, captchaToken)
        navigate('/', { replace: true })
      } catch (err) {
        if (err.status === 423) {
          setRetryAfter(err.data.retry_after || 0)
        } else {
          setFormError(err.detail || 'Не удалось войти.')
          if (typeof err.data.attempts_remaining === 'number') setAttemptsRemaining(err.data.attempts_remaining)
          if (err.data.captcha_required) setCaptchaRequired(true)
        }
      } finally {
        setSubmitting(false)
      }
    },
    [email, password, captchaToken, login, navigate]
  )

  if (retryAfter > 0) {
    return (
      <AuthShell title="Вход в систему">
        <div className="ele-auth-icon-circle" style={{ background: 'var(--color-fill-active-tint)' }}>
          <Icon name="clock" size={26} strokeWidth={2} style={{ color: 'var(--color-text-muted)' }} />
        </div>
        <div className="ele-auth-centered-text">
          <div style={{ fontWeight: 600, fontSize: 17, color: 'var(--color-text-primary)', marginBottom: 8 }}>
            Вход временно заблокирован
          </div>
          Исчерпан лимит попыток. Повторить вход можно через{' '}
          <b style={{ color: 'var(--color-text-primary)' }}>{formatCountdown(retryAfter)}</b>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell title="Вход в систему">
      {successMessage ? <Banner variant="success">{successMessage}</Banner> : null}
      {yandexErrorParam ? (
        <Banner variant="error">{YANDEX_ERROR_MESSAGES[yandexErrorParam] || 'Не удалось войти через Яндекс ID.'}</Banner>
      ) : null}
      {formError ? (
        <Banner variant="error">
          {formError}
          {typeof attemptsRemaining === 'number' ? ` Осталось попыток: ${attemptsRemaining} из 5` : ''}
        </Banner>
      ) : null}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Input
          label="Email"
          type="email"
          required
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Input
          label="Пароль"
          required
          showToggle
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <div className="ele-auth-card__link-row">
          <Link to="/reset-password">Забыли пароль?</Link>
        </div>

        {captchaRequired && bootstrap.captcha_site_key ? (
          <SmartCaptcha siteKey={bootstrap.captcha_site_key} onToken={setCaptchaToken} />
        ) : null}

        <Button type="submit" fullWidth loading={submitting}>
          Войти
        </Button>
      </form>

      {bootstrap.yandex_id_enabled ? (
        <>
          <div className="ele-auth-card__divider">или</div>
          <a className="ele-auth-card__yandex" href="/api/auth/yandex-id/authorize/">
            <img src="/brand/yandex-id.png" alt="" />
            Войти через Яндекс ID
          </a>
        </>
      ) : null}

      <div className="ele-auth-card__footer">
        Нет аккаунта? <Link to="/register">Зарегистрироваться</Link>
      </div>
    </AuthShell>
  )
}
