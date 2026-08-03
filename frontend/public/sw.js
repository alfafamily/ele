// Service worker: устанавливаемость PWA (B44 — плюс приём Web Push).
// Offline-режим намеренно не реализуется: сервис предполагает постоянное
// соединение с сервером, ответы не кешируются.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

// Перехватываем ТОЛЬКО same-origin запросы. Кросс-доменные (аватары/логотип из
// S3, шрифты Google) пропускаем мимо SW — иначе повторный fetch() внутри worker'а
// подпадает под CSP-директиву connect-src (там только 'self' + капча), тогда как
// нативная загрузка <img>/шрифта проходит под img-src/font-src (где https:
// разрешён). Перехват тут не даёт ничего (кэша нет) и лишь ломал кросс-домен.
self.addEventListener('fetch', (event) => {
  if (new URL(event.request.url).origin !== self.location.origin) return
  event.respondWith(fetch(event.request))
})

// B44. Показ push-уведомления. Сервер шлёт JSON {title, body, url, tag}.
self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = { body: event.data ? event.data.text() : '' }
  }
  const title = payload.title || 'ELE'
  const options = {
    body: payload.body || '',
    tag: payload.tag || undefined,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: payload.url || '/' },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

// B44. Клик по уведомлению — фокус на уже открытую вкладку приложения или
// открытие новой на нужном маршруте SPA.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate?.(target)
          return client.focus()
        }
      }
      return self.clients.openWindow(target)
    }),
  )
})
