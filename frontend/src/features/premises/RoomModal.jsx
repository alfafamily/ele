import { useState } from 'react'
import { Banner, Button, Input, Modal } from '../../shared/ui'
import { createRoom, updateRoom } from './premisesApi.js'

// Создание/редактирование Помещения/зоны внутри здания. Название обязательно;
// номер этажа — необязателен (строка: «5», «1А», «-1P»).
export function RoomModal({ buildingId, room, onClose, onDone }) {
  const isEdit = Boolean(room)
  const [name, setName] = useState(room?.name || '')
  const [floor, setFloor] = useState(room?.floor || '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})

  const submit = async () => {
    setSubmitting(true)
    setError(null)
    setFieldErrors({})
    const payload = { building: buildingId, name, floor }
    try {
      const saved = isEdit ? await updateRoom(room.id, payload) : await createRoom(payload)
      onDone(saved)
    } catch (err) {
      if (err.errors) {
        setFieldErrors(err.errors)
      } else {
        setError(err.detail || 'Не удалось сохранить помещение.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={isEdit ? 'Редактирование помещения/зоны' : 'Новое помещение/зона'}>
      {error ? <Banner variant="error">{error}</Banner> : null}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, margin: '4px 0 20px' }}>
        <Input
          label="Название / номер"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={fieldErrors.name}
        />
        <Input
          label="Номер этажа"
          placeholder="например: 5, 1А, -1P"
          value={floor}
          onChange={(e) => setFloor(e.target.value)}
          error={fieldErrors.floor}
        />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Button fullWidth loading={submitting} onClick={submit}>
          Сохранить
        </Button>
        <Button variant="secondary" fullWidth onClick={onClose}>
          Отмена
        </Button>
      </div>
    </Modal>
  )
}
