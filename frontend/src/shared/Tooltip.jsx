import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// Кастомная всплывающая подсказка: тёмная плашка через портал, задержка 120мс,
// только на устройствах с hover (десктоп). Оборачивает любой элемент (иконку
// статуса и т.п.), текст — в `label`. Native `title` не используем — у него
// нерегулируемая большая задержка и системный вид.
const HOVER_DELAY_MS = 120

export function Tooltip({ label, children, className, style, inline = true, ...rest }) {
  const ref = useRef(null)
  const [tip, setTip] = useState(null)
  const timer = useRef(null)

  useEffect(() => () => clearTimeout(timer.current), [])

  const canHover = typeof window !== 'undefined' && window.matchMedia?.('(hover: hover)').matches

  const show = () => {
    if (!label || !canHover) return
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const maxW = 300
      const centerX = rect.left + rect.width / 2
      const left = Math.min(Math.max(8 + maxW / 2, centerX), window.innerWidth - maxW / 2 - 8)
      setTip({ text: label, left, top: rect.bottom + 6, maxW })
    }, HOVER_DELAY_MS)
  }
  const hide = () => {
    clearTimeout(timer.current)
    setTip(null)
  }

  return (
    <>
      <span
        ref={ref}
        className={className}
        style={{ display: inline ? 'inline-flex' : 'flex', ...style }}
        onMouseEnter={show}
        onMouseLeave={hide}
        {...rest}
      >
        {children}
      </span>
      {tip
        ? createPortal(
            <div
              style={{
                position: 'fixed', left: tip.left, top: tip.top, transform: 'translateX(-50%)',
                zIndex: 9999, maxWidth: tip.maxW, background: 'var(--color-text-primary)',
                color: 'var(--color-surface)', fontSize: 12.5, lineHeight: 1.35, padding: '6px 10px',
                borderRadius: 8, pointerEvents: 'none', whiteSpace: 'normal', overflowWrap: 'anywhere',
                boxShadow: '0 6px 20px rgba(0,0,0,.18)',
              }}
            >
              {tip.text}
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
