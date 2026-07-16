import { useState } from 'react'
import { Banner, Button, Input, Modal } from '../../shared/ui'

// Переименование Типа оборудования/лицензий. Меняется только название —
// реквизиты и привязанные объекты не затрагиваются.
export function RenameTypeModal({ type, onClose, onRename }) {
  const [name, setName] = useState(type.name)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const submit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      await onRename(name.trim())
    } catch (err) {
      setError(err.errors ? Object.values(err.errors).flat().join(' ') : err.detail || 'Не удалось переименовать тип.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Переименовать тип">
      {error ? <Banner variant="error">{error}</Banner> : null}
      <Input label="Наименование" required autoFocus value={name} onChange={(e) => setName(e.target.value)} />
      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <Button variant="secondary" fullWidth onClick={onClose}>
          Отмена
        </Button>
        <Button fullWidth loading={submitting} disabled={!name.trim() || name.trim() === type.name} onClick={submit}>
          Сохранить
        </Button>
      </div>
    </Modal>
  )
}
