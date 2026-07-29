// Точка входа воркера PDF.js. Полифилл-модуль импортируется первым, поэтому
// Promise.withResolvers применяется до кода воркера pdfjs (нужно для старых
// мобильных браузеров). Сборка через Vite `?worker` (см. PdfView) — воркер
// компилируется в .js-чанк с корректным MIME.
import './withResolversPolyfill.js'
import 'pdfjs-dist/build/pdf.worker.min.mjs'
