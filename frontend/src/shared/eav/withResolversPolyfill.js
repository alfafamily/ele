// Полифилл Promise.withResolvers для старых мобильных браузеров (Safari <17.4,
// старые Chromium/WebView/Яндекс): PDF.js v4 использует этот API и без него
// падает — как в главном потоке, так и в воркере. Модуль импортируется ДО pdfjs
// (порядок вычисления ES-модулей гарантирует применение полифилла первым).
if (typeof Promise.withResolvers !== 'function') {
  // eslint-disable-next-line no-extend-native
  Promise.withResolvers = function withResolvers() {
    let resolve
    let reject
    const promise = new Promise((res, rej) => {
      resolve = res
      reject = rej
    })
    return { promise, resolve, reject }
  }
}
