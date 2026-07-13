import { useState } from 'react'
import { Banner, Button, Input, Modal } from '../../shared/ui'

export function NewTypeModal({ onClose, onCreate }) {
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const submit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      await onCreate(name)
    } catch (err) {
      setError(err.errors ? Object.values(err.errors).flat().join(' ') : err.detail || 'Не удалось создать тип.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Новый тип">
      {error ? <Banner variant="error">{error}</Banner> : null}
      <Input label="Наименование" required autoFocus value={name} onChange={(e) => setName(e.target.value)} />
      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <Button variant="secondary" fullWidth onClick={onClose}>
          Отмена
        </Button>
        <Button fullWidth loading={submitting} disabled={!name.trim()} onClick={submit}>
          Создать
        </Button>
      </div>
    </Modal>
  )
}
