import { useState } from 'react'
import { EmployeePicker } from '../../shared/EmployeePicker.jsx'
import { Banner, Button, Checkbox, Input, Modal, Select } from '../../shared/ui'
import { createPlace, updatePlace } from './premisesApi.js'

// Создание/редактирование Места внутри помещения. Тип места (B8): Рабочее
// место / Место хранения. За рабочим местом можно закрепить сотрудников.
export function PlaceModal({ roomId, place, onClose, onDone }) {
  const isEdit = Boolean(place)
  const [name, setName] = useState(place?.name || '')
  const [placeType, setPlaceType] = useState(place?.place_type || 'workplace')
  const [requiresPass, setRequiresPass] = useState(place?.requires_pass || false)
  const [selected, setSelected] = useState(place?.employees_detail || [])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})

  const submit = async () => {
    setSubmitting(true)
    setError(null)
    setFieldErrors({})
    const payload = {
      room: roomId,
      name,
      place_type: placeType,
      requires_pass: requiresPass,
      employees: placeType === 'workplace' ? selected.map((e) => e.id) : [],
    }
    try {
      const saved = isEdit ? await updatePlace(place.id, payload) : await createPlace(payload)
      onDone(saved)
    } catch (err) {
      if (err.errors) {
        setFieldErrors(err.errors)
      } else {
        setError(err.detail || 'Не удалось сохранить место.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={isEdit ? 'Редактирование места' : 'Новое место'}>
      {error ? <Banner variant="error">{error}</Banner> : null}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, margin: '4px 0 20px' }}>
        <Input
          label="Название / номер"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={fieldErrors.name}
        />
        <Select label="Тип места" required value={placeType} onChange={setPlaceType} error={fieldErrors.place_type}>
          <option value="workplace">Рабочее место</option>
          <option value="storage">Место хранения</option>
        </Select>
        <Checkbox label="Требуется ключ/пропуск" checked={requiresPass} onChange={setRequiresPass} />
        {placeType === 'workplace' ? (
          <WorkplaceEmployees selected={selected} onChange={setSelected} />
        ) : null}
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

// Множественный выбор сотрудников за рабочим местом — общий подбор (как при
// закреплении оборудования: список сразу + поиск), плюс чипы уже выбранных.
function WorkplaceEmployees({ selected, onChange }) {
  const selectedIds = new Set(selected.map((e) => e.id))
  const add = (emp) => {
    if (!selectedIds.has(emp.id)) onChange([...selected, { id: emp.id, name: emp.full_name }])
  }
  const remove = (id) => onChange(selected.filter((e) => e.id !== id))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Закреплённые сотрудники</div>
      {selected.length ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {selected.map((e) => (
            <span
              key={e.id}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--color-badge-text)',
                background: 'var(--color-badge-bg)',
                padding: '3px 6px 3px 10px',
                borderRadius: 20,
              }}
            >
              {e.name}
              <button
                type="button"
                onClick={() => remove(e.id)}
                aria-label="Убрать"
                style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'inherit', fontSize: 14, lineHeight: 1, padding: 0 }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <EmployeePicker onSelect={add} />
    </div>
  )
}
