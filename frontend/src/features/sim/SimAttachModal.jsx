import { useState } from 'react'
import { EmployeePicker } from '../../shared/EmployeePicker.jsx'
import { EquipmentPicker } from '../../shared/EquipmentPicker.jsx'
import { Banner, Button, Modal } from '../../shared/ui'
import { attachSimCard, attachSimToEquipment } from '../employees/employeesApi.js'

// Размещение SIM через модалку: за сотрудником или в оборудовании.
export function SimAttachModal({ sim, initialMode = 'employee', onClose, onDone }) {
  const [mode, setMode] = useState(initialMode)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const doAttach = async (fn) => {
    setSubmitting(true)
    setError(null)
    try {
      await fn()
      onDone()
    } catch (err) {
      setError(err.detail || 'Не удалось привязать.')
      setSubmitting(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Разместить SIM-карту">
      {error ? <Banner variant="error">{error}</Banner> : null}
      <div style={{ display: 'flex', gap: 8, margin: '4px 0 16px' }}>
        {[
          { value: 'employee', label: 'За сотрудником' },
          { value: 'equipment', label: 'В оборудовании' },
        ].map((m) => (
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
      {mode === 'employee' ? (
        <EmployeePicker autoFocus onSelect={(e) => !submitting && doAttach(() => attachSimCard(sim.id, e.id))} />
      ) : (
        <EquipmentPicker autoFocus onSelect={(eq) => !submitting && doAttach(() => attachSimToEquipment(sim.id, eq.id))} />
      )}
      <div style={{ marginTop: 16 }}>
        <Button variant="secondary" fullWidth onClick={onClose}>
          Отмена
        </Button>
      </div>
    </Modal>
  )
}
