import { useState } from 'react'
import { Banner, Button, Modal, PlaceSelect } from '../../shared/ui'

// Открепление объекта (от сотрудника/места) на склад — место хранения
// обязательно (B8). onConfirm(storagePlaceId) — асинхронный.
export function DetachToStorageModal({ title = 'Открепить на склад', confirmLabel = 'Открепить', description, onConfirm, onClose }) {
  const [placeId, setPlaceId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const submit = async () => {
    if (!placeId) return setError('Выберите место хранения.')
    setSubmitting(true)
    setError(null)
    try {
      await onConfirm(Number(placeId))
    } catch (err) {
      setError(err.detail || 'Не удалось открепить.')
      setSubmitting(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={title}>
      {error ? <Banner variant="error">{error}</Banner> : null}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, margin: '4px 0 20px' }}>
        {description ? <div style={{ fontSize: 13.5, color: 'var(--color-text-muted)' }}>{description}</div> : null}
        <PlaceSelect placeType="storage" required value={placeId} onChange={setPlaceId} />
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <Button variant="secondary" fullWidth onClick={onClose}>
          Отмена
        </Button>
        <Button fullWidth loading={submitting} onClick={submit}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}
