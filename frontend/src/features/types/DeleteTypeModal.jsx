import { useState } from 'react'
import { Banner, Button, Modal } from '../../shared/ui'

// T2 — удаление Вида без привязанных объектов; вместе с Видом удаляются
// все его реквизиты.
export function DeleteTypeModal({ type, onClose, onConfirm }) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const submit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      await onConfirm()
    } catch (err) {
      setError(err.detail || 'Не удалось удалить вид.')
      setSubmitting(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={`Удалить вид «${type.name}»?`}>
      {error ? <Banner variant="error">{error}</Banner> : null}
      <p style={{ fontSize: 14, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
        К виду не привязано ни одного объекта. Вместе с видом будут удалены все его реквизиты (
        <b style={{ color: 'var(--color-text-primary)' }}>{type.fields.length}</b>). Действие необратимо.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 20 }}>
        <Button variant="danger-solid" fullWidth loading={submitting} onClick={submit}>
          Удалить вид и реквизиты
        </Button>
        <Button variant="secondary" fullWidth onClick={onClose}>
          Отмена
        </Button>
      </div>
    </Modal>
  )
}
