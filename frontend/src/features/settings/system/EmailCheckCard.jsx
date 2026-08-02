import { useState } from 'react'
import { Button, Card, Input } from '../../../shared/ui'
import { sendSmtpTestCode, verifySmtpTestCode } from '../settingsApi.js'
import { sectionTitle, sectionHint, checkRow, EMAIL_HELP } from './helpers.js'
import { CheckResult, CheckSuccess, HelpButton, HelpModal } from './parts.jsx'

// Проверка почты (SMTP): код прилетает письмом, пользователь вводит его обратно.
export function EmailCheckCard({ status }) {
  const [smtpStatus, setSmtpStatus] = useState('idle') // idle|sending|sent|checking|ok
  const [smtpCode, setSmtpCode] = useState('')
  const [smtpEmail, setSmtpEmail] = useState('')
  const [smtpError, setSmtpError] = useState(null)
  const [help, setHelp] = useState(null) // { title, items } | null

  const sendSmtp = async () => {
    setSmtpStatus('sending')
    setSmtpError(null)
    try {
      const data = await sendSmtpTestCode()
      setSmtpEmail(data.email)
      setSmtpCode('')
      setSmtpStatus('sent')
    } catch (err) {
      setSmtpStatus('idle')
      setSmtpError(err.detail || 'Не удалось отправить письмо. Проверьте настройки SMTP в .env.')
    }
  }

  const verifySmtp = async () => {
    setSmtpStatus('checking')
    setSmtpError(null)
    try {
      await verifySmtpTestCode(smtpCode)
      setSmtpStatus('ok')
    } catch (err) {
      setSmtpStatus('sent')
      setSmtpError(err.detail || 'Неверный код.')
    }
  }

  const openHelp = () => setHelp({ title: 'Письмо с кодом не пришло', items: EMAIL_HELP })

  return (
    <Card style={{ flex: 1, minWidth: 0 }}>
      <div style={sectionTitle}>Проверка почты (SMTP)</div>
      <div style={sectionHint}>
        {status.email_configured
          ? 'Отправим письмо с кодом на вашу почту и попросим ввести код'
          : 'Параметры SMTP не заданы в .env, отправка писем невозможна'}
      </div>
      {status.email_configured ? (
        smtpStatus === 'ok' ? (
          // Успех — только зелёная галочка с подписью, без кнопок/полей.
          <CheckSuccess />
        ) : smtpStatus === 'sent' || smtpStatus === 'checking' ? (
          <>
            <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)', marginBottom: 10 }}>Код отправлен на {smtpEmail}</div>
            {/* Кнопка помощи — в том же ряду (переносится только при нехватке места). */}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ width: 160 }}>
                <Input className="ele-field--fixed" value={smtpCode} onChange={(e) => setSmtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="Код из письма" />
              </div>
              <Button type="button" loading={smtpStatus === 'checking'} disabled={smtpCode.length !== 6} onClick={verifySmtp}>
                Подтвердить
              </Button>
              <Button type="button" variant="secondary" onClick={sendSmtp}>
                Отправить ещё раз
              </Button>
              <HelpButton label="Письма нет" onClick={openHelp} />
            </div>
            {smtpError ? <div style={{ marginTop: 10 }}><CheckResult result={{ ok: false, msg: smtpError }} /></div> : null}
          </>
        ) : (
          <div style={checkRow}>
            <Button type="button" variant="secondary" loading={smtpStatus === 'sending'} onClick={sendSmtp}>
              Выполнить проверку
            </Button>
            {/* Помощь показываем только если проверка запускалась и была ошибка. */}
            {smtpError ? <HelpButton label="Письма нет" onClick={openHelp} /> : null}
            {smtpError ? <CheckResult result={{ ok: false, msg: smtpError }} /> : null}
          </div>
        )
      ) : null}

      <HelpModal help={help} onClose={() => setHelp(null)} />
    </Card>
  )
}
