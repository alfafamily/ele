import { useEffect, useState } from 'react'
import { Button, Modal } from '../../shared/ui'
import { getVapidKey } from './notificationsApi.js'
import { currentSubscription, enablePush, permissionDenied, pushSupported } from './push.js'

// B44. Разовое предложение включить push после входа: показываем, если push
// доступен (защищённый контекст, поддержка, настроен на сервере, не заблокирован)
// и на этом устройстве ещё нет подписки. Один раз за сессию браузера.
const SESSION_KEY = 'ele-push-prompt-shown'

export function PushPromptModal() {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [vapidKey, setVapidKey] = useState('')

  useEffect(() => {
    let cancelled = false
    async function maybeShow() {
      try {
        if (sessionStorage.getItem(SESSION_KEY)) return
      } catch {
        return
      }
      if (!pushSupported() || window.isSecureContext === false || permissionDenied()) return
      try {
        if (await currentSubscription()) return // уже включён на этом устройстве
      } catch {
        return
      }
      let key
      try {
        key = await getVapidKey()
      } catch {
        return
      }
      if (cancelled || !key?.configured || !key.public_key) return
      setVapidKey(key.public_key)
      try {
        sessionStorage.setItem(SESSION_KEY, '1')
      } catch {
        /* приватный режим — покажем без запоминания */
      }
      setOpen(true)
    }
    maybeShow()
    return () => {
      cancelled = true
    }
  }, [])

  const onEnable = async () => {
    setBusy(true)
    try {
      // Запрос браузера покажется поверх модалки; любой ответ (Разрешить/
      // Блокировать) закрывает модалку.
      await enablePush(vapidKey)
    } catch {
      /* отказ/ошибка — всё равно закрываем */
    } finally {
      setBusy(false)
      setOpen(false)
    }
  }

  if (!open) return null
  return (
    <Modal open={open} onClose={() => setOpen(false)} title="Включите push-уведомления">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--color-text-secondary)' }}>
          Чтобы не пропустить важные события, включите push-уведомления. Их можно отключить или
          включить позже в разделе Уведомления.
        </div>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>
            Позже
          </Button>
          <Button onClick={onEnable} disabled={busy}>
            Включить
          </Button>
        </div>
      </div>
    </Modal>
  )
}
