import { useState } from 'react'
import { EmployeePicker } from '../../shared/EmployeePicker.jsx'
import { SelectedEmployee } from '../../shared/SelectedEmployee.jsx'
import { ModeToggle } from '../../shared/ModeToggle.jsx'
import { PLACEMENT } from '../../shared/placement.js'
import { Banner, FormActions, Input, Modal, PlaceSelect } from '../../shared/ui'
import { assignEquipment, unassignEquipment } from './equipmentApi.js'

// Размещение единицы оборудования (B8): за сотрудником (мобильно), на рабочем
// месте / в МОП (стационарно, B45) или на складе (свободно). Одна модалка на
// все переходы. Рабочее место и МОП — отдельные вкладки, но оба стационарны
// (mode=stationary на бэке), просто с разным типом мест в списке.
const MODES = [
  { value: 'mobile', ...PLACEMENT.employee },
  { value: 'workplace', ...PLACEMENT.workplace },
  { value: 'common', ...PLACEMENT.common },
  { value: 'storage', ...PLACEMENT.storage },
]
const PLACE_TYPE = { workplace: 'workplace', common: 'common', storage: 'storage' }

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
        // Рабочее место и МОП — стационарное размещение (одинаковый режим на бэке).
        await assignEquipment(equipment.id, {
          mode: mode === 'mobile' ? 'mobile' : 'stationary',
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
        <ModeToggle
          mode={mode}
          options={MODES}
          style={{ marginBottom: 0 }}
          onChange={(v) => {
            setMode(v)
            setPlaceId('') // сбрасываем место — у нового режима свой список
            setError(null)
          }}
        />

        {mode === 'mobile' ? (
          employee ? (
            <SelectedEmployee employee={employee} onClear={() => setEmployee(null)} />
          ) : (
            <EmployeePicker autoFocus onSelect={setEmployee} />
          )
        ) : (
          <PlaceSelect
            placeType={PLACE_TYPE[mode]}
            label={null}
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
      <FormActions
        style={{ marginTop: 0 }}
        onCancel={onClose}
        onSubmit={submit}
        submitting={submitting}
        submitLabel="Сохранить"
      />
    </Modal>
  )
}
