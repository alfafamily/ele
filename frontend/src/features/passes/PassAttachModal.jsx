import { useState } from 'react'
import { EmployeePicker } from '../../shared/EmployeePicker.jsx'
import { SelectedEmployee } from '../../shared/SelectedEmployee.jsx'
import { Banner, Button, Modal } from '../../shared/ui'
import { attachPass } from '../employees/employeesApi.js'

// Привязка пропуска/ключа к сотруднику. После выбора сотрудника действие
// применяется только по подтверждению кнопкой «Закрепить».
export function PassAttachModal({ pass, onClose, onDone }) {
  const [selected, setSelected] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const submit = async () => {
    if (!selected) return
    setSubmitting(true)
    setError(null)
    try {
      await attachPass(pass.id, selected.id)
      onDone()
    } catch (err) {
      setError(err.detail || 'Не удалось закрепить.')
      setSubmitting(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Закрепить за сотрудником">
      {error ? <Banner variant="error">{error}</Banner> : null}
      {selected ? (
        <SelectedEmployee employee={selected} onClear={() => setSelected(null)} />
      ) : (
        <EmployeePicker autoFocus onSelect={setSelected} />
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
