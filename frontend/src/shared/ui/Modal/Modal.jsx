import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../Icon/Icon.jsx'
import './Modal.css'

// Один компонент, две раскладки по CSS-медиа-запросу: модалка по
// центру на desktop, bottom-sheet снизу ниже ~768px — без дублирования
// логики open/close между вариантами.
export function Modal({ open, onClose, title, children }) {
  // Закрываем по клику на подложку только если и нажатие (mousedown), и клик
  // произошли на самой подложке. Иначе протяжка курсора из инпута за границы
  // модалки (выделение текста) отпускалась бы на подложке и закрывала окно.
  const pressedOnOverlay = useRef(false)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    document.addEventListener('keydown', onKeyDown)
    // Блокируем скролл фона, пока открыта модалка. `overflow: hidden` на body
    // не удерживает тач-скролл в iOS Safari (фон продолжает прокручиваться под
    // модалкой), поэтому фиксируем body через position: fixed с сохранением
    // текущей позиции и восстанавливаем её при закрытии.
    const scrollY = window.scrollY
    const body = document.body
    const prev = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
    }
    body.style.position = 'fixed'
    body.style.top = `-${scrollY}px`
    body.style.left = '0'
    body.style.right = '0'
    body.style.width = '100%'
    body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      body.style.position = prev.position
      body.style.top = prev.top
      body.style.left = prev.left
      body.style.right = prev.right
      body.style.width = prev.width
      body.style.overflow = prev.overflow
      // Возвращаем страницу на прежнюю позицию (position: fixed её сбросил).
      window.scrollTo(0, scrollY)
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div
      className="ele-modal-overlay"
      onMouseDown={(e) => {
        pressedOnOverlay.current = e.target === e.currentTarget
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && pressedOnOverlay.current) onClose?.()
      }}
    >
      <div className="ele-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="ele-modal__grabber" aria-hidden />
        {title || onClose ? (
          <div className="ele-modal__header">
            {title ? <div className="ele-modal__title">{title}</div> : <span style={{ flex: 1 }} />}
            {onClose ? (
              <button type="button" className="ele-modal__close" onClick={onClose} aria-label="Закрыть">
                <Icon name="x" size={20} strokeWidth={2} />
              </button>
            ) : null}
          </div>
        ) : null}
        {children}
      </div>
    </div>,
    document.body
  )
}
