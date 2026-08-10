import { useState } from 'react'
import { Banner } from '../Banner/Banner.jsx'
import { Button } from '../Button/Button.jsx'
import { Input } from '../Input/Input.jsx'
import { Modal } from '../Modal/Modal.jsx'
import { ModalActions } from '../ModalActions/ModalActions.jsx'

// Единый каркас терминальных модалок (утилизация/списание): заголовок +
// предупреждающий текст + необязательный «Комментарий» + danger-футер. Общая
// часть — состояние (comment/submitting/error) и обработчик submit; специфика
// задаётся пропсами. Предупреждение передаётся детьми (парент владеет его
// разметкой и отступами). onConfirm(comment) — асинхронный вызов API, его
// результат уходит в onDone. Отступы поля/футера настраиваются под конкретную
// модалку, чтобы вид не менялся при переходе на общий компонент.
export function TerminalActionModal({
  title,
  submitLabel,
  onConfirm,
  onClose,
  onDone,
  children,
  commentPlaceholder = 'Например: утилизировано по акту №…',
  errorFallback = 'Не удалось выполнить действие.',
  commentStyle = { marginTop: 16 },
  actionsStyle = { marginTop: 18 },
}) {
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const submit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const saved = await onConfirm(comment.trim() || undefined)
      onDone(saved)
    } catch (err) {
      setError(err.detail || errorFallback)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={title}>
      {error ? <Banner variant="error">{error}</Banner> : null}
      {children}
      <div style={commentStyle}>
        <Input
          label="Комментарий (необязательно)"
          multiline
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={commentPlaceholder}
        />
      </div>
      <ModalActions style={actionsStyle}>
        <Button variant="danger-solid" fullWidth loading={submitting} onClick={submit}>
          {submitLabel}
        </Button>
        <Button variant="secondary" fullWidth onClick={onClose}>
          Отмена
        </Button>
      </ModalActions>
    </Modal>
  )
}
