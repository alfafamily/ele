import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// Текст с обрезкой (однострочной «…» либо многострочным клампом через className,
// singleLine={false}). Если содержимое реально не помещается — при наведении
// курсора (только устройства с hover, т.е. десктоп) через короткую задержку
// показывается кастомный тултип с полным текстом. Native title не используем —
// у него нерегулируемая большая задержка.
const HOVER_DELAY_MS = 120

export function TruncatedText({ as: Tag = 'div', text, children, className, style, singleLine = true, ...rest }) {
  const ref = useRef(null)
  const [truncated, setTruncated] = useState(false)
  const [tip, setTip] = useState(null) // { text, left, top } | null
  const timer = useRef(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const check = () => setTruncated(el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [children])

  useEffect(() => () => clearTimeout(timer.current), [])

  const canHover = typeof window !== 'undefined' && window.matchMedia?.('(hover: hover)').matches

  const onEnter = () => {
    if (!truncated || !canHover) return
    const el = ref.current
    const full = text ?? el?.textContent ?? ''
    const rect = el.getBoundingClientRect()
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const maxW = 360
      const left = Math.min(rect.left, window.innerWidth - maxW - 8)
      setTip({ text: full, left: Math.max(8, left), top: rect.bottom + 4, maxW })
    }, HOVER_DELAY_MS)
  }
  const onLeave = () => {
    clearTimeout(timer.current)
    setTip(null)
  }

  const baseStyle = singleLine
    ? { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', ...style }
    : style

  return (
    <>
      <Tag ref={ref} className={className} style={baseStyle} onMouseEnter={onEnter} onMouseLeave={onLeave} {...rest}>
        {children}
      </Tag>
      {tip
        ? createPortal(
            <div
              style={{
                position: 'fixed', left: tip.left, top: tip.top, zIndex: 9999, maxWidth: tip.maxW,
                background: 'var(--color-text-primary)', color: 'var(--color-surface)', fontSize: 12.5,
                lineHeight: 1.35, padding: '6px 10px', borderRadius: 8, pointerEvents: 'none',
                whiteSpace: 'normal', overflowWrap: 'anywhere', boxShadow: '0 6px 20px rgba(0,0,0,.18)',
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
