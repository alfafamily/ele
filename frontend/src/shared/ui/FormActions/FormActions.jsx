import { Button } from '../Button/Button.jsx'

// Единый ряд действий формы создания/редактирования: «Отмена» + основная кнопка
// справа. Размещается внизу формы, одинаково на desktop и мобильных.
export function FormActions({
  onCancel,
  onSubmit,
  submitting = false,
  submitLabel = 'Сохранить',
  submitDisabled = false,
  cancelLabel = 'Отмена',
}) {
  return (
    <div className="ele-form-actions">
      <Button variant="secondary" onClick={onCancel}>
        {cancelLabel}
      </Button>
      <Button loading={submitting} disabled={submitDisabled} onClick={onSubmit}>
        {submitLabel}
      </Button>
    </div>
  )
}
