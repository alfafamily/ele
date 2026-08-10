import { useState } from 'react'
import { EmployeePicker } from '../../shared/EmployeePicker.jsx'
import { SelectedEmployee } from '../../shared/SelectedEmployee.jsx'
import { SelectedTransport } from '../../shared/SelectedTransport.jsx'
import { TransportPicker } from '../premises/TransportPicker.jsx'
import { Banner, FormActions, Modal } from '../../shared/ui'
import { attachPass, attachPassToTransport } from '../employees/employeesApi.js'

// Привязка средства доступа к владельцу. Персональный пропуск/ключ — к
// сотруднику; транспортный пропуск (B34) — к единице транспорта. Действие
// применяется только по подтверждению кнопкой «Закрепить».
export function PassAttachModal({ pass, onClose, onDone }) {
  const isTransport = pass.pass_kind === 'transport'
  const [selected, setSelected] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const submit = async () => {
    if (!selected) return
    setSubmitting(true)
    setError(null)
    try {
      if (isTransport) await attachPassToTransport(pass.id, selected.id)
      else await attachPass(pass.id, selected.id)
      onDone()
    } catch (err) {
      setError(err.detail || 'Не удалось закрепить.')
      setSubmitting(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={isTransport ? 'Закрепить за транспортом' : 'Закрепить за сотрудником'}>
      {error ? <Banner variant="error">{error}</Banner> : null}
      {isTransport ? (
        selected ? (
          <SelectedTransport transport={selected} onClear={() => setSelected(null)} />
        ) : (
          <TransportPicker purpose="pass" onSelect={setSelected} />
        )
      ) : selected ? (
        <SelectedEmployee employee={selected} onClear={() => setSelected(null)} />
      ) : (
        <EmployeePicker autoFocus onSelect={setSelected} />
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
