import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../Icon/Icon.jsx'
import './Modal.css'

// Один компонент, две раскладки по CSS-медиа-запросу: модалка по
// центру на desktop, bottom-sheet снизу ниже ~768px — без дублирования
// логики open/close между вариантами.
export function Modal({ open, onClose, title, children }) {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    document.addEventListener('keydown', onKeyDown)
    // Блокируем скролл фона, пока открыта модалка: иначе на мобильных жест
    // прокрутки внутри модалки «проваливается» на страницу под ней.
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="ele-modal-overlay" onClick={onClose}>
      <div className="ele-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="ele-modal__grabber" aria-hidden />
        {title || onClose ? (
          <div className="ele-modal__header">
            {title ? <div className="ele-modal__title">{title}</div> : <span style={{ flex: 1 }} />}
            {onClose ? (
              <button type="button" className="ele-modal__close" onClick={onClose} aria-label="Закрыть">
                {/* Высота крестика ≈ высоте заглавной буквы заголовка. */}
                <Icon name="x" size={15} strokeWidth={2.2} />
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
