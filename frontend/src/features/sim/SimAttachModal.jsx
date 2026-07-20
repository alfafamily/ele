import { useState } from 'react'
import { EmployeePicker } from '../../shared/EmployeePicker.jsx'
import { EquipmentPicker } from '../../shared/EquipmentPicker.jsx'
import { SelectedEmployee } from '../../shared/SelectedEmployee.jsx'
import { Banner, Button, Icon, Modal } from '../../shared/ui'
import { attachSimCard, attachSimToEquipment } from '../employees/employeesApi.js'

// Размещение SIM через модалку: за сотрудником или в оборудовании. После выбора
// объекта действие не применяется сразу — ждём подтверждения кнопкой «Закрепить».
export function SimAttachModal({ sim, initialMode = 'employee', onClose, onDone }) {
  const [mode, setMode] = useState(initialMode)
  const [selected, setSelected] = useState(null) // employee | equipment (по режиму)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const submit = async () => {
    if (!selected) return
    setSubmitting(true)
    setError(null)
    try {
      if (mode === 'equipment') await attachSimToEquipment(sim.id, selected.id)
      else await attachSimCard(sim.id, selected.id)
      onDone()
    } catch (err) {
      setError(err.detail || 'Не удалось закрепить.')
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
              setSelected(null)
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

      {selected ? (
        mode === 'employee' ? (
          <SelectedEmployee employee={selected} onClear={() => setSelected(null)} />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', background: 'var(--color-fill-input)', borderRadius: 10 }}>
            <Icon name="tag" size={16} strokeWidth={2} style={{ color: 'var(--color-text-muted)', flex: 'none' }} />
            <span style={{ minWidth: 0, flex: 1 }}>
              <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected.type_and_model}</span>
              <span style={{ display: 'block', fontSize: 11.5, color: 'var(--color-text-placeholder)', fontFamily: 'var(--font-mono)' }}>{selected.inventory_number}</span>
            </span>
            <button type="button" onClick={() => setSelected(null)} title="Изменить" aria-label="Изменить" style={{ width: 28, height: 28, flex: 'none', borderRadius: 8, background: 'var(--color-surface)', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'inset 0 0 0 1px var(--color-border)' }}>
              <Icon name="x" size={15} strokeWidth={2} />
            </button>
          </div>
        )
      ) : mode === 'employee' ? (
        <EmployeePicker autoFocus onSelect={setSelected} />
      ) : (
        <EquipmentPicker autoFocus onSelect={setSelected} />
      )}

      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <Button variant="secondary" fullWidth onClick={onClose}>
          Отмена
        </Button>
        <Button fullWidth disabled={!selected} loading={submitting} onClick={submit}>
          Закрепить
        </Button>
      </div>
    </Modal>
  )
}
