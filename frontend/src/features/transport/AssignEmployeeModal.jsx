import { useState } from 'react'
import { EmployeePicker } from '../../shared/EmployeePicker.jsx'
import { SelectedEmployee } from '../../shared/SelectedEmployee.jsx'
import { Banner, Button, Input, Modal } from '../../shared/ui'
import { assignTransport } from './transportApi.js'

// B3. Закрепление транспорта за сотрудником (открепление — отдельным действием
// на карточке). Одна из двух операций размещения (закрепить / открепить).
export function AssignEmployeeModal({ transport, onClose, onDone }) {
  const [employee, setEmployee] = useState(null)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const submit = async () => {
    setError(null)
    if (!employee) return setError('Выберите сотрудника.')
    setSubmitting(true)
    try {
      await assignTransport(transport.id, employee.id, comment.trim())
      onDone()
    } catch (err) {
      setError(err.detail || 'Не удалось закрепить транспорт.')
      setSubmitting(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Закрепить транспорт за сотрудником">
      {error ? <Banner variant="error">{error}</Banner> : null}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, margin: '4px 0 20px' }}>
        {employee ? (
          <SelectedEmployee employee={employee} onClear={() => setEmployee(null)} />
        ) : (
          <EmployeePicker autoFocus onSelect={setEmployee} />
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
          Закрепить
        </Button>
      </div>
    </Modal>
  )
}
