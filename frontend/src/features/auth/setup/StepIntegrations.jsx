import { useEffect, useState } from 'react'
import { apiGet, apiPost } from '../../../shared/api/client'
import { Banner, Button, Input, StatusPill } from '../../../shared/ui'

// Шаг 3 «Проверка интеграций» (ТЗ §4.1 v1.3): бэкенд не пишет в .env и не
// принимает секреты через UI — только показывает, что уже задано, и
// тестирует. Локальный статус карточки не тождественен env.*.verified
// (тот boolean не различает «ещё не проверяли» и «проверили — не вышло»),
// поэтому ведём его сами по итогу каждого запроса.

function StatusBadge({ status }) {
  if (status === 'skipped') return <StatusPill variant="archived">Пропущено</StatusPill>
  if (status === 'ok') return <StatusPill variant="assigned">Готово</StatusPill>
  if (status === 'fail') return <StatusPill variant="danger">Недоступно</StatusPill>
  return <StatusPill variant="archived">Не проверено</StatusPill>
}

export function StepIntegrations({ admin, company, onBack, onDone }) {
  const [env, setEnv] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [completing, setCompleting] = useState(false)
  const [completeError, setCompleteError] = useState(null)

  const [storageStatus, setStorageStatus] = useState('idle')
  const [storageChecking, setStorageChecking] = useState(false)

  const [emailStatus, setEmailStatus] = useState('idle') // idle|sending|sent|checking|ok|fail
  const [emailError, setEmailError] = useState(null)
  const [code, setCode] = useState('')

  const [captchaStatus, setCaptchaStatus] = useState('idle')
  const [captchaChecking, setCaptchaChecking] = useState(false)

  const [yandexStatus, setYandexStatus] = useState('idle')
  const [yandexChecking, setYandexChecking] = useState(false)

  useEffect(() => {
    apiGet('/api/setup/environment/')
      .then((data) => {
        setEnv(data)
        setStorageStatus(data.storage.mode !== 's3' ? 'ok' : data.storage.verified ? 'ok' : 'idle')
        setEmailStatus(!data.email.configured ? 'skipped' : data.email.verified_email === admin.email ? 'ok' : 'idle')
        setCaptchaStatus(!data.captcha.configured ? 'skipped' : data.captcha.verified ? 'ok' : 'idle')
        setYandexStatus(!data.yandex_id.configured ? 'skipped' : data.yandex_id.verified ? 'ok' : 'idle')
        if (data.storage.mode !== 's3') {
          // Локальное хранилище доступно всегда — фиксируем это на сервере
          // (session-флаг), чтобы не было расхождения с бэкендом.
          apiPost('/api/setup/test-storage-connection/').catch(() => {})
        }
      })
      .catch((err) => setLoadError(err.detail || 'Не удалось загрузить состояние окружения.'))
  }, [admin.email])

  if (loadError) return <Banner variant="error">{loadError}</Banner>
  if (!env) return null

  const checkStorage = async () => {
    setStorageChecking(true)
    try {
      await apiPost('/api/setup/test-storage-connection/')
      setStorageStatus('ok')
    } catch {
      setStorageStatus('fail')
    } finally {
      setStorageChecking(false)
    }
  }

  const sendEmailCode = async () => {
    setEmailStatus('sending')
    setEmailError(null)
    try {
      await apiPost('/api/setup/test-email/', { email: admin.email })
      setEmailStatus('sent')
    } catch (err) {
      setEmailStatus('idle')
      setEmailError(err.detail || 'Не удалось отправить письмо.')
    }
  }

  const verifyEmailCode = async () => {
    setEmailStatus('checking')
    setEmailError(null)
    try {
      await apiPost('/api/setup/verify-email/', { code })
      setEmailStatus('ok')
    } catch (err) {
      setEmailStatus('sent')
      setEmailError(err.detail || 'Неверный код.')
    }
  }

  const checkCaptcha = async () => {
    setCaptchaChecking(true)
    try {
      await apiPost('/api/setup/test-captcha/')
      setCaptchaStatus('ok')
    } catch {
      setCaptchaStatus('fail')
    } finally {
      setCaptchaChecking(false)
    }
  }

  const checkYandex = async () => {
    setYandexChecking(true)
    try {
      await apiPost('/api/setup/test-yandex-id/')
      setYandexStatus('ok')
    } catch {
      setYandexStatus('fail')
    } finally {
      setYandexChecking(false)
    }
  }

  const canComplete =
    storageStatus !== 'fail' &&
    (env.storage.mode !== 's3' || storageStatus === 'ok') &&
    (!env.email.configured || emailStatus === 'ok') &&
    (!env.captcha.configured || captchaStatus === 'ok') &&
    (!env.yandex_id.configured || yandexStatus === 'ok')

  const complete = async () => {
    setCompleting(true)
    setCompleteError(null)
    try {
      await apiPost('/api/setup/complete/', { admin, company })
      onDone()
    } catch (err) {
      setCompleteError(err.errors?.non_field_errors || [err.detail || 'Не удалось завершить настройку.'])
    } finally {
      setCompleting(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div className="ele-wizard-step__title">Проверка интеграций</div>
        <div className="ele-wizard-step__subtitle">
          Показано то, что уже задано в .env сервера. Изменить значения можно только там же, с перезапуском
          docker compose up -d — ввода секретов здесь нет.
        </div>
      </div>

      {completeError ? (
        <Banner variant="error">
          {completeError.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </Banner>
      ) : null}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="ele-integration-card">
          <div className="ele-integration-card__body">
            <div className="ele-integration-card__title">
              Хранилище файлов — {env.storage.mode === 's3' ? 'S3' : 'Локально'}
            </div>
            <div className="ele-integration-card__meta">
              {env.storage.mode === 's3' ? `${env.storage.endpoint} · ${env.storage.bucket}` : 'Доступно всегда, доп. проверка не требуется'}
            </div>
          </div>
          {env.storage.mode === 's3' && storageStatus !== 'ok' ? (
            <Button variant="secondary" loading={storageChecking} onClick={checkStorage}>
              Проверить подключение
            </Button>
          ) : (
            <StatusBadge status={storageStatus} />
          )}
        </div>

        <div className="ele-integration-card">
          <div className="ele-integration-card__body">
            <div className="ele-integration-card__title">Почта (SMTP)</div>
            <div className="ele-integration-card__meta">
              {!env.email.configured
                ? 'Не задано в .env — уведомления не будут отправляться'
                : emailStatus === 'sent'
                  ? `Код отправлен на ${admin.email}`
                  : emailStatus === 'ok'
                    ? `Подтверждено для ${admin.email}`
                    : `Задано в .env: ${env.email.host}`}
            </div>
            {emailError ? <div style={{ color: 'var(--color-error)', fontSize: 12, marginTop: 4 }}>{emailError}</div> : null}
            {emailStatus === 'sent' || emailStatus === 'checking' ? (
              <div style={{ display: 'flex', gap: 8, marginTop: 10, maxWidth: 260 }}>
                <Input
                  label="Код из письма"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                />
              </div>
            ) : null}
          </div>
          {!env.email.configured ? (
            <StatusBadge status="skipped" />
          ) : emailStatus === 'idle' ? (
            <Button variant="secondary" onClick={sendEmailCode}>
              Отправить код
            </Button>
          ) : emailStatus === 'sending' ? (
            <Button variant="secondary" loading>
              Отправить код
            </Button>
          ) : emailStatus === 'ok' ? (
            <StatusBadge status="ok" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Button loading={emailStatus === 'checking'} disabled={code.length !== 6} onClick={verifyEmailCode}>
                Подтвердить
              </Button>
              <Button variant="secondary" onClick={sendEmailCode}>
                Отправить ещё раз
              </Button>
            </div>
          )}
        </div>

        <div className="ele-integration-card">
          <div className="ele-integration-card__body">
            <div className="ele-integration-card__title">Яндекс SmartCaptcha</div>
            <div className="ele-integration-card__meta">
              {env.captcha.configured
                ? 'Базовая проверка доступности — не гарантия валидности ключей'
                : 'Не задано в .env'}
            </div>
          </div>
          {!env.captcha.configured ? (
            <StatusBadge status="skipped" />
          ) : captchaStatus === 'ok' ? (
            <StatusBadge status="ok" />
          ) : (
            <Button variant="secondary" loading={captchaChecking} onClick={checkCaptcha}>
              {captchaStatus === 'fail' ? 'Повторить проверку' : 'Проверить'}
            </Button>
          )}
        </div>

        <div className="ele-integration-card">
          <div className="ele-integration-card__body">
            <div className="ele-integration-card__title">Яндекс ID OAuth</div>
            <div className="ele-integration-card__meta">
              {env.yandex_id.configured
                ? 'Базовая проверка доступности — не гарантия валидности ключей'
                : 'Не задано в .env'}
            </div>
          </div>
          {!env.yandex_id.configured ? (
            <StatusBadge status="skipped" />
          ) : yandexStatus === 'ok' ? (
            <StatusBadge status="ok" />
          ) : (
            <Button variant="secondary" loading={yandexChecking} onClick={checkYandex}>
              {yandexStatus === 'fail' ? 'Повторить проверку' : 'Проверить'}
            </Button>
          )}
        </div>
      </div>

      <div className="ele-wizard-actions">
        <Button type="button" variant="secondary" onClick={onBack}>
          Назад
        </Button>
        <Button
          type="button"
          loading={completing}
          disabled={!canComplete}
          title={!canComplete ? 'Пройдите проверку заданных в .env интеграций' : undefined}
          onClick={complete}
        >
          Завершить настройку
        </Button>
      </div>
    </div>
  )
}
