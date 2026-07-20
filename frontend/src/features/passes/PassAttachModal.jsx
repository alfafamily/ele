import { useState } from 'react'
import { EmployeePicker } from '../../shared/EmployeePicker.jsx'
import { Banner, Button, Modal } from '../../shared/ui'
import { attachPass } from '../employees/employeesApi.js'

// Привязка пропуска/ключа к сотруднику через модалку.
export function PassAttachModal({ pass, onClose, onDone }) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const onSelect = async (employee) => {
    if (submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await attachPass(pass.id, employee.id)
      onDone()
    } catch (err) {
      setError(err.detail || 'Не удалось привязать.')
      setSubmitting(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Привязать к сотруднику">
      {error ? <Banner variant="error">{error}</Banner> : null}
      <EmployeePicker autoFocus onSelect={onSelect} />
      <div style={{ marginTop: 16 }}>
        <Button variant="secondary" fullWidth onClick={onClose}>
          Отмена
        </Button>
      </div>
    </Modal>
  )
}
