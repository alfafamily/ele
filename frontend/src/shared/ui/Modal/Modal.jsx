import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../Icon/Icon.jsx'
import './Modal.css'

// Селектор фокусируемых элементов внутри модалки — для переноса и удержания
// (trap) фокуса, чтобы Tab не «убегал» на фоновую страницу под открытым окном.
const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'

// Один компонент, две раскладки по CSS-медиа-запросу: модалка по
// центру на desktop, bottom-sheet снизу ниже ~768px — без дублирования
// логики open/close между вариантами.
export function Modal({ open, onClose, title, children, className }) {
  // Закрываем по клику на подложку только если и нажатие (mousedown), и клик
  // произошли на самой подложке. Иначе протяжка курсора из инпута за границы
  // модалки (выделение текста) отпускалась бы на подложке и закрывала окно.
  const pressedOnOverlay = useRef(false)
  const dialogRef = useRef(null)
  const titleId = useId()

  useEffect(() => {
    if (!open) return
    // Запоминаем элемент, с которого открыли модалку, чтобы вернуть на него
    // фокус при закрытии (иначе фокус «теряется» на body — скринридер и
    // клавиатура начинают навигацию с начала страницы).
    const previouslyFocused = document.activeElement
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose?.()
        return
      }
      // Удержание фокуса внутри модалки (focus trap): по Tab с последнего
      // элемента переходим на первый и наоборот, не выпуская фокус на фон.
      if (e.key === 'Tab') {
        const dialog = dialogRef.current
        if (!dialog) return
        const items = dialog.querySelectorAll(FOCUSABLE)
        if (items.length === 0) {
          e.preventDefault()
          dialog.focus()
          return
        }
        const first = items[0]
        const last = items[items.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKeyDown)
    // Переносим фокус на контейнер модалки после монтирования портала. Именно
    // на сам диалог (tabIndex=-1), а не на первый интерактивный элемент — чтобы
    // не «преднажать» опасную кнопку (напр. подтверждение удаления) и чтобы
    // скринридер объявил заголовок окна (aria-labelledby).
    const focusTimer = setTimeout(() => {
      const dialog = dialogRef.current
      if (dialog && !dialog.contains(document.activeElement)) dialog.focus()
    }, 0)
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
      clearTimeout(focusTimer)
      body.style.position = prev.position
      body.style.top = prev.top
      body.style.left = prev.left
      body.style.right = prev.right
      body.style.width = prev.width
      body.style.overflow = prev.overflow
      // Возвращаем страницу на прежнюю позицию (position: fixed её сбросил).
      window.scrollTo(0, scrollY)
      // Возвращаем фокус на элемент, с которого открыли модалку.
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus()
      }
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
      <div
        ref={dialogRef}
        className={'ele-modal' + (className ? ` ${className}` : '')}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ele-modal__grabber" aria-hidden />
        {title || onClose ? (
          <div className="ele-modal__header">
            {title ? <div className="ele-modal__title" id={titleId}>{title}</div> : <span style={{ flex: 1 }} />}
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
