// B44. Управление Web Push-подпиской на уровне устройства (браузер/PWA).
// Настройки каналов (почта/push) — общие для пользователя; сама подписка на
// push включается отдельно на каждом устройстве, поэтому её состояние берём из
// PushManager этого браузера, а не из настроек аккаунта.
import { subscribePush, unsubscribePush } from './notificationsApi.js'

export function pushSupported() {
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

// Причина недоступности push (для подписи под кнопкой). Различаем http (сервис
// работает по незащищённому протоколу — API push браузер не отдаёт) и реально
// неподдерживающий браузер (защищённый контекст, но нужных API нет).
// '' — push доступен.
export function pushUnavailableReason() {
  if (typeof window !== 'undefined' && window.isSecureContext === false) return 'insecure'
  if (!pushSupported()) return 'unsupported'
  return ''
}

export function permissionDenied() {
  return pushSupported() && Notification.permission === 'denied'
}

// applicationServerKey ожидает Uint8Array — конвертируем base64url-ключ VAPID.
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i)
  return output
}

export async function currentSubscription() {
  if (!pushSupported()) return null
  const reg = await navigator.serviceWorker.ready
  return reg.pushManager.getSubscription()
}

// Включить push на этом устройстве: спросить разрешение, подписаться в браузере,
// сохранить подписку на сервере. Бросает Error с понятным текстом при отказе.
export async function enablePush(vapidPublicKey) {
  if (!pushSupported()) throw new Error('Этот браузер не поддерживает push-уведомления.')
  if (!vapidPublicKey) throw new Error('Push-уведомления не настроены на сервере.')

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error('Разрешение на уведомления не выдано в браузере.')
  }
  const reg = await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    })
  }
  await subscribePush(sub.toJSON())
  return sub
}

// Отключить push на этом устройстве: снять подписку в браузере и на сервере.
export async function disablePush() {
  const sub = await currentSubscription()
  if (!sub) return
  try {
    await unsubscribePush(sub.endpoint)
  } finally {
    await sub.unsubscribe()
  }
}
