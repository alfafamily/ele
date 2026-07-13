import { useState } from 'react'
import { Banner, Button, Modal } from '../../shared/ui'

// T2 — удаление Типа без привязанных объектов; вместе с Типом удаляются
// все его реквизиты (§5.4).
export function DeleteTypeModal({ type, onClose, onConfirm }) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const submit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      await onConfirm()
    } catch (err) {
      setError(err.detail || 'Не удалось удалить тип.')
      setSubmitting(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={`Удалить тип «${type.name}»?`}>
      {error ? <Banner variant="error">{error}</Banner> : null}
      <p style={{ fontSize: 14, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
        К типу не привязано ни одного объекта. Вместе с типом будут удалены все его реквизиты (
        <b style={{ color: 'var(--color-text-primary)' }}>{type.fields.length}</b>). Действие необратимо.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 20 }}>
        <Button variant="danger-solid" fullWidth loading={submitting} onClick={submit}>
          Удалить тип и реквизиты
        </Button>
        <Button variant="secondary" fullWidth onClick={onClose}>
          Отмена
        </Button>
      </div>
    </Modal>
  )
}
