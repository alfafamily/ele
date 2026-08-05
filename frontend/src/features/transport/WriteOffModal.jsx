import { useState } from 'react'
import { Banner, Button, Input, Modal, ModalActions } from '../../shared/ui'
import { writeOffTransport } from './transportApi.js'

// B3. Списание транспорта в архив с необязательным комментарием (причина).
export function WriteOffModal({ transport, onClose, onDone }) {
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const submit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const updated = await writeOffTransport(transport.id, comment.trim() || undefined)
      onDone(updated)
    } catch (err) {
      setError(err.detail || 'Не удалось списать транспорт.')
      setSubmitting(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Списать транспорт?">
      {error ? <Banner variant="error">{error}</Banner> : null}
      <p style={{ fontSize: 14, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
        Объект <b style={{ color: 'var(--color-text-primary)' }}>{transport.type_and_model}</b> будет перемещён в
        архив. Восстановление из архива через интерфейс не предусмотрено.
      </p>
      <div style={{ marginTop: 16 }}>
        <Input
          label="Комментарий (необязательно)"
          multiline
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Например: списано по акту №… (причина списания)"
        />
      </div>
      <ModalActions style={{ marginTop: 18 }}>
        <Button variant="danger-solid" fullWidth loading={submitting} onClick={submit}>
          Списать
        </Button>
        <Button variant="secondary" fullWidth onClick={onClose}>
          Отмена
        </Button>
      </ModalActions>
    </Modal>
  )
}
