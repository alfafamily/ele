import { useState } from 'react'
import { Banner, Button, Input, Modal } from '../../shared/ui'
import { utilizeLicense } from './licensesApi.js'

// L4 — утилизация: отвязывает от оборудования и переводит в архив,
// без варианта отмены из интерфейса .
export function UtilizeModal({ license, onClose, onDone }) {
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const submit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const updated = await utilizeLicense(license.id, comment.trim() || undefined)
      onDone(updated)
    } catch (err) {
      setError(err.detail || 'Не удалось утилизировать лицензию.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Утилизировать лицензию?">
      {error ? <Banner variant="error">{error}</Banner> : null}
      <p style={{ fontSize: 14, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
        Лицензия <b style={{ color: 'var(--color-text-primary)' }}>{license.license_type_name}</b> будет отвязана от оборудования и
        перемещена в архив. Восстановление из интерфейса не предусмотрено.
      </p>
      <div style={{ marginTop: 16 }}>
        <Input
          label="Комментарий (необязательно)"
          multiline
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Например: утилизировано по акту №…"
        />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 20 }}>
        <Button variant="danger-solid" fullWidth loading={submitting} onClick={submit}>
          Утилизировать
        </Button>
        <Button variant="secondary" fullWidth onClick={onClose}>
          Отмена
        </Button>
      </div>
    </Modal>
  )
}
