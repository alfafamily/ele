// Единый вертикальный ряд действий модального окна: основная кнопка сверху,
// «Отмена» — снизу, обе на всю ширину. В отличие от FormActions (горизонтальный
// ряд под формой) применяется в диалогах подтверждения/утилизации/списания и
// прочих модалках. Кнопки передаются детьми — вариант и подписи задаёт вызов.
export function ModalActions({ children, style, className = '' }) {
  return (
    <div className={['ele-modal-actions', className].filter(Boolean).join(' ')} style={style}>
      {children}
    </div>
  )
}
