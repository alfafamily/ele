import { useState } from 'react'
import { EmployeePicker } from '../../shared/EmployeePicker.jsx'
import { EquipmentPicker } from '../../shared/EquipmentPicker.jsx'
import { LeadIconCircle } from '../../shared/LeadIconCircle.jsx'
import { SelectedEmployee } from '../../shared/SelectedEmployee.jsx'
import { ModeToggle } from '../../shared/ModeToggle.jsx'
import { PLACEMENT } from '../../shared/placement.js'
import { Banner, FormActions, Icon, Modal } from '../../shared/ui'
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
      <ModeToggle
        mode={mode}
        options={[
          { value: 'employee', ...PLACEMENT.employee },
          { value: 'equipment', icon: 'cpu', label: 'В оборудовании' },
        ]}
        style={{ margin: '4px 0 16px' }}
        onChange={(v) => {
          setMode(v)
          setSelected(null)
          setError(null)
        }}
      />

      {selected ? (
        mode === 'employee' ? (
          <SelectedEmployee employee={selected} onClear={() => setSelected(null)} />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', background: 'var(--color-fill-input)', borderRadius: 10 }}>
            <LeadIconCircle name="tag" size={30} iconSize={15} tinted />
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
        <EquipmentPicker autoFocus simOnly onSelect={setSelected} />
      )}

      <FormActions
        onCancel={onClose}
        onSubmit={submit}
        submitting={submitting}
        submitDisabled={!selected}
        submitLabel="Закрепить"
      />
    </Modal>
  )
}
