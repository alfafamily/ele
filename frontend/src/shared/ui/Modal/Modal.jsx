import { useEffect } from 'react'
import { createPortal } from 'react-dom'
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
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="ele-modal-overlay" onClick={onClose}>
      <div className="ele-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="ele-modal__grabber" aria-hidden />
        {onClose ? (
          <button type="button" className="ele-modal__close" onClick={onClose} aria-label="Закрыть">
            ✕
          </button>
        ) : null}
        {title ? <div className="ele-modal__title">{title}</div> : null}
        {children}
      </div>
    </div>,
    document.body
  )
}
