import { useEffect, useRef, useState } from 'react'
import { Spinner } from '../ui/Spinner/Spinner.jsx'
// Полифилл до pdfjs (главный поток) — старые мобильные браузеры без
// Promise.withResolvers иначе роняют pdfjs v4.
import './withResolversPolyfill.js'

// Единый воркер pdfjs на все документы (переиспользуется между открытиями PDF).
let pdfWorkerPort = null

// Инлайн-рендер PDF через PDF.js (Mozilla). Библиотека и её worker грузятся
// ЛЕНИВО (dynamic import) — только при первом открытии PDF, отдельными чанками,
// поэтому основной бандл не растёт. Рисуем страницы на <canvas>, что работает
// одинаково на десктопе и мобильных браузерах (Android/Chrome/Яндекс не умеют
// показывать PDF во встроенном <iframe>). При сбое — onError (модалка покажет
// запасной вид со скачиванием).
export function PdfView({ url, onError }) {
  const scrollRef = useRef(null)
  const pagesRef = useRef(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    let pdfDoc = null
    setLoading(true)

    ;(async () => {
      try {
        const pdfjsLib = await import('pdfjs-dist')
        // Воркер — через Vite `?worker` (компилируется в отдельный .js-чанк с
        // полифиллом внутри). Прежний вариант `?url` + workerSrc грузил воркер
        // как модуль .mjs по URL (new Worker(url,{type:'module'})) и не открывался
        // на мобильных браузерах; `?worker` инстанцирует воркер надёжно.
        // Создаём один раз и переиспользуем как workerPort.
        if (!pdfWorkerPort) {
          const PdfWorker = (await import('./pdfWorker.js?worker')).default
          pdfWorkerPort = new PdfWorker()
        }
        pdfjsLib.GlobalWorkerOptions.workerPort = pdfWorkerPort
        const task = pdfjsLib.getDocument({ url })
        const pdf = await task.promise
        if (cancelled) { pdf.destroy?.(); return }
        pdfDoc = pdf

        const column = pagesRef.current
        if (!column) return
        column.innerHTML = ''
        const cssWidth = Math.max(240, column.clientWidth || 800)
        const dpr = Math.min(window.devicePixelRatio || 1, 2)

        for (let n = 1; n <= pdf.numPages; n += 1) {
          if (cancelled) return
          const page = await pdf.getPage(n)
          const base = page.getViewport({ scale: 1 })
          const viewport = page.getViewport({ scale: (cssWidth * dpr) / base.width })
          const canvas = document.createElement('canvas')
          canvas.width = viewport.width
          canvas.height = viewport.height
          canvas.style.width = '100%'
          canvas.style.height = 'auto'
          canvas.style.display = 'block'
          canvas.style.marginBottom = '10px'
          canvas.style.background = '#fff'
          canvas.style.boxShadow = '0 1px 4px rgba(0,0,0,0.18)'
          column.appendChild(canvas)
          await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
        }
        if (!cancelled) setLoading(false)
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('PdfView render failed:', e)
        if (!cancelled) onError?.(e)
      }
    })()

    return () => {
      cancelled = true
      pdfDoc?.destroy?.()
    }
  }, [url, onError])

  return (
    <div
      ref={scrollRef}
      style={{ position: 'relative', flex: 1, alignSelf: 'stretch', minHeight: 0, width: '100%', overflow: 'auto', padding: 12, boxSizing: 'border-box' }}
    >
      {loading ? (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Spinner />
        </div>
      ) : null}
      <div ref={pagesRef} style={{ width: '100%', maxWidth: 900, margin: '0 auto' }} />
    </div>
  )
}
