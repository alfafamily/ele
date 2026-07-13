// Минимальный no-op service worker — только для критерия «устанавливаемости»
// PWA в части браузеров. Offline-режим намеренно не реализуется (§8.5):
// сервис предполагает постоянное соединение с сервером, поэтому ответы
// не кешируются — просто прозрачно проксируем сеть.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request))
})
