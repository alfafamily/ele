import { useState } from 'react'
import { Banner, Button, Checkbox, Modal } from '../../shared/ui'
import { terminateEmployee } from './employeesApi.js'

// E3 — увольнение (§5.3): отвязывает всё оборудование, при наличии связанной
// учётной записи предлагает опционально деактивировать её.
export function TerminateModal({ employee, onClose, onDone }) {
  const [deactivateUser, setDeactivateUser] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const equipmentCount = employee.equipment?.length ?? 0

  const submit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const updated = await terminateEmployee(employee.id, deactivateUser)
      onDone(updated)
    } catch (err) {
      setError(err.detail || 'Не удалось уволить сотрудника.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Уволить сотрудника?">
      {error ? <Banner variant="error">{error}</Banner> : null}
      <p style={{ fontSize: 14, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
        Сотрудник <b style={{ color: 'var(--color-text-primary)' }}>{employee.full_name}</b> будет переведён в статус
        «Уволен».{' '}
        {equipmentCount > 0 ? (
          <>
            Всё закреплённое оборудование (<b style={{ color: 'var(--color-text-primary)' }}>{equipmentCount} {equipmentCount === 1 ? 'единица' : 'единицы'}</b>) будет автоматически откреплено.
          </>
        ) : null}
      </p>
      {employee.user_email ? (
        <>
          <Banner variant="warning">
            Сотрудник связан с учётной записью <b>{employee.user_email}</b>.
          </Banner>
          <div style={{ margin: '16px 0' }}>
            <Checkbox label="Также деактивировать связанную учётную запись" checked={deactivateUser} onChange={setDeactivateUser} />
          </div>
        </>
      ) : (
        <div style={{ height: 16 }} />
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Button variant="danger-solid" fullWidth loading={submitting} onClick={submit}>
          Уволить{equipmentCount > 0 ? ' и открепить оборудование' : ''}
        </Button>
        <Button variant="secondary" fullWidth onClick={onClose}>
          Отмена
        </Button>
      </div>
    </Modal>
  )
}
