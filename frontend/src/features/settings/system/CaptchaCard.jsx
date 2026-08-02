import { useState } from 'react'
import { SmartCaptcha } from '../../auth/SmartCaptcha.jsx'
import { Button, Card } from '../../../shared/ui'
import { checkCaptcha } from '../settingsApi.js'
import { sectionTitle, sectionHint, checkRow } from './helpers.js'
import { CheckResult, CheckSuccess } from './parts.jsx'

// Проверка Яндекс SmartCaptcha — решение капчи проверяется на сервере.
export function CaptchaCard({ status }) {
  const [captchaOpen, setCaptchaOpen] = useState(false)
  const [captchaResult, setCaptchaResult] = useState(null) // { ok, msg }
  const [captchaChecking, setCaptchaChecking] = useState(false)

  const onCaptchaToken = async (token) => {
    setCaptchaChecking(true)
    setCaptchaResult(null)
    try {
      const data = await checkCaptcha(token)
      setCaptchaResult({ ok: true, msg: data.detail })
    } catch (err) {
      setCaptchaResult({ ok: false, msg: err.detail || 'Капча не пройдена.' })
    } finally {
      setCaptchaChecking(false)
      setCaptchaOpen(false)
    }
  }

  return (
    <Card style={{ flex: 1, minWidth: 0 }}>
      <div style={sectionTitle}>Проверка Яндекс SmartCaptcha</div>
      <div style={sectionHint}>
        {status.captcha_configured
          ? 'Решите капчу — сервер проверит корректность её работы и подключения.'
          : 'Параметры Яндекс SmartCaptcha не заданы в .env, использование Яндекс SmartCaptcha невозможно'}
      </div>
      {status.captcha_configured ? (
        captchaResult?.ok ? (
          <CheckSuccess />
        ) : captchaOpen ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <SmartCaptcha siteKey={status.captcha_site_key} onToken={onCaptchaToken} />
            {captchaChecking ? <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Проверяем…</div> : null}
          </div>
        ) : (
          <div style={checkRow}>
            <Button type="button" variant="secondary" onClick={() => { setCaptchaResult(null); setCaptchaOpen(true) }}>
              Выполнить проверку
            </Button>
            {captchaResult && !captchaResult.ok ? <CheckResult result={captchaResult} /> : null}
          </div>
        )
      ) : null}
    </Card>
  )
}
