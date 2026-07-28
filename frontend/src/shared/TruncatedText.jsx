import { useEffect, useRef, useState } from 'react'

// Однострочный текст с обрезкой в «…». Если текст реально не помещается —
// проставляем native-атрибут title, и при наведении курсора (десктоп; на тач-
// устройствах title не срабатывает) показывается тултип с полным текстом.
// text — строка для тултипа (по умолчанию берём textContent из содержимого).
export function TruncatedText({ as: Tag = 'div', text, children, className, style, ...rest }) {
  const ref = useRef(null)
  const [title, setTitle] = useState(undefined)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const check = () => {
      const truncated = el.scrollWidth > el.clientWidth + 1
      setTitle(truncated ? (text ?? el.textContent ?? undefined) || undefined : undefined)
    }
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [text, children])

  return (
    <Tag
      ref={ref}
      className={className}
      title={title}
      style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', ...style }}
      {...rest}
    >
      {children}
    </Tag>
  )
}
