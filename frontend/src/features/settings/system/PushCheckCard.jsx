import { useState } from 'react'
import { Button, Card, Input } from '../../../shared/ui'
import { getVapidKey } from '../../notifications/notificationsApi.js'
import { currentSubscription, enablePush, isIOS, permissionDenied, pushUnavailableReason } from '../../notifications/push.js'
import { sendPushTestCode, verifyPushTestCode } from '../settingsApi.js'
import { sectionTitle, sectionHint, checkRow, PUSH_HELP } from './helpers.js'
import { CheckResult, CheckSuccess, HelpButton, HelpModal } from './parts.jsx'

// Проверка Push-уведомлений — код прилетает push'ом на это устройство (по образцу
// SMTP-проверки).
export function PushCheckCard({ status }) {
  const [pushStatus, setPushStatus] = useState('idle') // idle|sending|sent|checking|ok
  const [pushCode, setPushCode] = useState('')
  const [pushError, setPushError] = useState(null)
  const [help, setHelp] = useState(null) // { title, items } | null

  const sendPush = async () => {
    setPushStatus('sending')
    setPushError(null)
    try {
      // Код прилетает в push, поэтому текущее устройство должно быть подписано —
      // если ещё нет, сначала включаем push (запрос разрешения браузера).
      const sub = await currentSubscription()
      if (!sub) {
        const key = await getVapidKey()
        await enablePush(key.public_key)
      }
      await sendPushTestCode()
      setPushCode('')
      setPushStatus('sent')
    } catch (err) {
      setPushStatus('idle')
      setPushError(err.detail || err.message || 'Не удалось отправить push. Проверьте настройки VAPID в .env.')
    }
  }

  const verifyPush = async () => {
    setPushStatus('checking')
    setPushError(null)
    try {
      await verifyPushTestCode(pushCode)
      setPushStatus('ok')
    } catch (err) {
      setPushStatus('sent')
      setPushError(err.detail || 'Неверный код.')
    }
  }

  const openHelp = () => setHelp({ title: 'Push с кодом не пришёл', items: PUSH_HELP })

  // Доступность push на этом устройстве: http/браузер без поддержки/запрет
  // уведомлений/нет VAPID — вместо кнопки показываем подсказку.
  const pushReason = pushUnavailableReason()
  const pushDenied = permissionDenied()
  const pushBlocked = pushReason !== '' || !status.push_configured || pushDenied
  let pushHint = ''
  if (pushReason === 'insecure') pushHint = 'Сервис ELE работает по http-протоколу — push-уведомления недоступны.'
  else if (pushReason === 'unsupported') pushHint = isIOS()
    ? 'На iPhone/iPad push работают только в приложении, добавленном на экран «Домой» через Safari.'
    : 'Этот браузер не поддерживает push-уведомления.'
  else if (pushDenied) pushHint = 'Уведомления заблокированы для этого сайта в браузере — разрешите их в настройках сайта и обновите страницу.'

  return (
    <Card style={{ flex: 1, minWidth: 0 }}>
      <div style={sectionTitle}>Проверка Push-уведомлений</div>
      <div style={sectionHint}>
        {status.push_configured
          ? 'Отправим push с кодом на ваши устройства и попросим ввести код'
          : 'Параметры VAPID не заданы в .env, отправка push-уведомлений невозможна'}
      </div>
      {status.push_configured ? (
        pushStatus === 'ok' ? (
          <CheckSuccess />
        ) : pushStatus === 'sent' || pushStatus === 'checking' ? (
          <>
            <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)', marginBottom: 10 }}>Код отправлен на это устройство</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ width: 160 }}>
                <Input className="ele-field--fixed" value={pushCode} onChange={(e) => setPushCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="Код из push" />
              </div>
              <Button type="button" loading={pushStatus === 'checking'} disabled={pushCode.length !== 6} onClick={verifyPush}>
                Подтвердить
              </Button>
              <Button type="button" variant="secondary" onClick={sendPush}>
                Отправить ещё раз
              </Button>
              <HelpButton label="Push'a нет" onClick={openHelp} />
            </div>
            {pushError ? <div style={{ marginTop: 10 }}><CheckResult result={{ ok: false, msg: pushError }} /></div> : null}
          </>
        ) : pushBlocked ? (
          // Push недоступен на устройстве (http / браузер / запрет) — подсказка
          // без кнопки проверки (её нажать нельзя).
          <div style={{ fontSize: 13, color: 'var(--color-text-placeholder)' }}>{pushHint}</div>
        ) : (
          <div style={checkRow}>
            <Button type="button" variant="secondary" loading={pushStatus === 'sending'} onClick={sendPush}>
              Выполнить проверку
            </Button>
            {pushError ? <HelpButton label="Push'a нет" onClick={openHelp} /> : null}
            {pushError ? <CheckResult result={{ ok: false, msg: pushError }} /> : null}
          </div>
        )
      ) : null}

      <HelpModal help={help} onClose={() => setHelp(null)} />
    </Card>
  )
}
