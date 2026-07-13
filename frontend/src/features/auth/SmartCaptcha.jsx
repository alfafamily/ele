import { useEffect, useId, useRef } from 'react'

const SCRIPT_SRC = 'https://smartcaptcha.yandexcloud.net/captcha.js'

// Виджет Яндекс SmartCaptcha (§4.6) — активен только когда backend отдал
// captcha_site_key (задан в .env, см. BootstrapView). Best-effort: если
// скрипт не загрузился (нет сети), поле токена просто остаётся пустым —
// сервер и так не примет вход без него в состоянии captcha_required.
export function SmartCaptcha({ siteKey, onToken }) {
  const containerRef = useRef(null)
  const widgetIdRef = useRef(null)
  const domId = useId()

  useEffect(() => {
    let cancelled = false

    function render() {
      if (cancelled || !window.smartCaptcha || !containerRef.current) return
      widgetIdRef.current = window.smartCaptcha.render(containerRef.current, {
        sitekey: siteKey,
        callback: (token) => onToken?.(token),
      })
    }

    if (window.smartCaptcha) {
      render()
    } else {
      let script = document.querySelector(`script[src="${SCRIPT_SRC}"]`)
      if (!script) {
        script = document.createElement('script')
        script.src = SCRIPT_SRC
        script.async = true
        document.head.appendChild(script)
      }
      script.addEventListener('load', render)
      return () => {
        cancelled = true
        script.removeEventListener('load', render)
      }
    }

    return () => {
      cancelled = true
      if (window.smartCaptcha && widgetIdRef.current != null) {
        window.smartCaptcha.destroy(widgetIdRef.current)
      }
    }
  }, [siteKey, onToken])

  return <div id={domId} ref={containerRef} />
}
