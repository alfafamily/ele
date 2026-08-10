import { Button } from '../Button/Button.jsx'

// Единый ряд действий формы создания/редактирования: «Отмена» + основная кнопка
// справа. Размещается внизу формы, одинаково на desktop и мобильных.
// style/className — для тонкой подстройки внешнего отступа в конкретной модалке
// (по умолчанию .ele-form-actions задаёт margin-top:20px).
export function FormActions({
  onCancel,
  onSubmit,
  submitting = false,
  submitLabel = 'Сохранить',
  submitDisabled = false,
  cancelLabel = 'Отмена',
  style,
  className = '',
}) {
  return (
    <div className={['ele-form-actions', className].filter(Boolean).join(' ')} style={style}>
      <Button variant="secondary" onClick={onCancel}>
        {cancelLabel}
      </Button>
      <Button loading={submitting} disabled={submitDisabled} onClick={onSubmit}>
        {submitLabel}
      </Button>
    </div>
  )
}
