import { useState } from 'react'
import { EmployeePicker } from '../../shared/EmployeePicker.jsx'
import { Banner, Button, Input, Modal, PlaceSelect } from '../../shared/ui'
import { assignEquipment, unassignEquipment } from './equipmentApi.js'

// Размещение единицы оборудования (B8): за сотрудником (мобильно), на рабочем
// месте (стационарно) или на складе (свободно). Одна модалка на все переходы.
const MODES = [
  { value: 'mobile', label: 'За сотрудником' },
  { value: 'stationary', label: 'На рабочем месте' },
  { value: 'storage', label: 'На складе' },
]

export function EquipmentPlacementModal({ equipment, onClose, onDone }) {
  const [mode, setMode] = useState('mobile')
  const [employee, setEmployee] = useState(null)
  const [placeId, setPlaceId] = useState('')
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const submit = async () => {
    setError(null)
    if (mode === 'mobile' && !employee) return setError('Выберите сотрудника.')
    if (mode !== 'mobile' && !placeId) return setError('Выберите место.')
    setSubmitting(true)
    try {
      if (mode === 'storage') {
        await unassignEquipment(equipment.id, placeId, comment.trim())
      } else {
        await assignEquipment(equipment.id, {
          mode,
          employeeId: employee?.id,
          placeId,
          comment: comment.trim(),
        })
      }
      onDone()
    } catch (err) {
      setError(err.detail || 'Не удалось изменить размещение.')
      setSubmitting(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Закрепить / разместить оборудование">
      {error ? <Banner variant="error">{error}</Banner> : null}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, margin: '4px 0 20px' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => {
                setMode(m.value)
                setError(null)
              }}
              style={{
                flex: 1,
                padding: '8px 6px',
                fontSize: 12.5,
                fontWeight: 600,
                fontFamily: 'inherit',
                cursor: 'pointer',
                borderRadius: 8,
                border: 'none',
                color: mode === m.value ? 'var(--color-primary-text)' : 'var(--color-text-secondary)',
                background: mode === m.value ? 'var(--color-primary)' : 'var(--color-fill-input)',
              }}
            >
              {m.label}
            </button>
          ))}
        </div>

        {mode === 'mobile' ? (
          employee ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 14 }}>
              <span>{employee.full_name}</span>
              <Button variant="secondary" onClick={() => setEmployee(null)}>
                Изменить
              </Button>
            </div>
          ) : (
            <EmployeePicker autoFocus onSelect={setEmployee} />
          )
        ) : (
          <PlaceSelect
            placeType={mode === 'stationary' ? 'workplace' : 'storage'}
            required
            value={placeId}
            onChange={setPlaceId}
          />
        )}

        <Input
          label="Комментарий"
          multiline
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Необязательный комментарий движения"
        />
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <Button variant="secondary" fullWidth onClick={onClose}>
          Отмена
        </Button>
        <Button fullWidth loading={submitting} onClick={submit}>
          Сохранить
        </Button>
      </div>
    </Modal>
  )
}
