import { useState } from 'react'
import { Banner, Button, Checkbox, Input, Modal } from '../../shared/ui'
import { createBuilding, updateBuilding } from './premisesApi.js'

// Создание/редактирование Здания. Наименование обязательно; адрес и
// этажность — необязательны.
export function BuildingModal({ building, onClose, onDone }) {
  const isEdit = Boolean(building)
  const [name, setName] = useState(building?.name || '')
  const [address, setAddress] = useState(building?.address || '')
  const [floorCount, setFloorCount] = useState(
    building?.floor_count != null ? String(building.floor_count) : ''
  )
  const [requiresPass, setRequiresPass] = useState(building?.requires_pass || false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})

  const submit = async () => {
    setSubmitting(true)
    setError(null)
    setFieldErrors({})
    const payload = {
      name,
      address,
      floor_count: floorCount === '' ? null : Number(floorCount),
      requires_pass: requiresPass,
    }
    try {
      const saved = isEdit ? await updateBuilding(building.id, payload) : await createBuilding(payload)
      onDone(saved)
    } catch (err) {
      if (err.errors) {
        setFieldErrors(err.errors)
      } else {
        setError(err.detail || 'Не удалось сохранить здание.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={isEdit ? 'Редактирование здания' : 'Новое здание'}>
      {error ? <Banner variant="error">{error}</Banner> : null}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, margin: '4px 0 20px' }}>
        <Input
          label="Наименование"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={fieldErrors.name}
        />
        <Input label="Адрес" value={address} onChange={(e) => setAddress(e.target.value)} error={fieldErrors.address} />
        <Input
          label="Этажность"
          type="number"
          min="0"
          value={floorCount}
          onChange={(e) => setFloorCount(e.target.value)}
          error={fieldErrors.floor_count}
        />
        <Checkbox label="Требуется ключ/пропуск" checked={requiresPass} onChange={setRequiresPass} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Button fullWidth loading={submitting} onClick={submit}>
          {isEdit ? 'Сохранить' : 'Создать'}
        </Button>
        <Button variant="secondary" fullWidth onClick={onClose}>
          Отмена
        </Button>
      </div>
    </Modal>
  )
}
