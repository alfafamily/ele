import { useState } from 'react'
import { Banner, Button, Checkbox, Input, Modal, Select } from '../../shared/ui'
import { terminateEmployee } from './employeesApi.js'

// Отображаемое имя средства доступа в списке увольнения.
function passLabel(pass) {
  if (pass.object_type === 'key') {
    const b = (pass.buildings || [])[0]
    const r = (pass.rooms || [])[0]
    const target = b ? (r ? `${r.name} (${b.name})` : b.name) : '—'
    return `Ключ · ${target}`
  }
  return `Пропуск · ${pass.name || (pass.account_number ? `№ ${pass.account_number}` : 'без названия')}`
}

// Строка выбора действия для одного объекта (SIM или пропуск/ключ) при
// увольнении: действие + необязательный комментарий (для вариантов утилизации).
function DispositionRow({ label, options, value, comment, onChange, onComment }) {
  const isUtilize = value !== 'detach'
  return (
    <div style={{ padding: '10px 0', borderTop: '1px solid var(--color-border-hairline)' }}>
      <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 8, overflowWrap: 'anywhere' }}>{label}</div>
      <Select value={value} onChange={onChange}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </Select>
      {isUtilize ? (
        <div style={{ marginTop: 8 }}>
          <Input multiline rows={2} value={comment} onChange={(e) => onComment(e.target.value)} placeholder="Комментарий (необязательно)" />
        </div>
      ) : null}
    </div>
  )
}

// E3 — увольнение: откепляет всё оборудование; для каждой выданной SIM и
// каждого пропуска/ключа спрашивает, что сделать (открепить / утилизировать /
// передать арендодателю); при наличии учётной записи предлагает деактивировать.
export function TerminateModal({ employee, onClose, onDone }) {
  const [deactivateUser, setDeactivateUser] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const equipmentCount = employee.equipment?.length ?? 0
  const activeSims = (employee.sim_cards ?? []).filter((s) => !s.is_deactivated && !s.is_utilized)
  const activePasses = (employee.passes ?? []).filter((p) => !p.is_deactivated && !p.is_utilized)

  // Состояние выбора по объектам: { [id]: { action, comment } }.
  const [simState, setSimState] = useState(() =>
    Object.fromEntries(activeSims.map((s) => [s.id, { action: 'detach', comment: '' }])),
  )
  const [passState, setPassState] = useState(() =>
    Object.fromEntries(activePasses.map((p) => [p.id, { action: 'detach', comment: '' }])),
  )

  const SIM_OPTIONS = [
    { value: 'detach', label: 'Открепить (станет неиспользуемой)' },
    { value: 'utilized', label: 'Утилизировать' },
  ]
  const PASS_OPTIONS = [
    { value: 'detach', label: 'Деактивировать (станет неиспользуемым)' },
    { value: 'utilized', label: 'Утилизировать' },
    { value: 'handed', label: 'Передать арендодателю' },
  ]

  const submit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const updated = await terminateEmployee(employee.id, {
        deactivateUser,
        simActions: simState,
        passActions: passState,
      })
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

      {activeSims.length > 0 ? (
        <div style={{ margin: '14px 0' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>Корпоративная связь</div>
          {activeSims.map((s) => (
            <DispositionRow
              key={s.id}
              label={`${s.sim_type_display} · ${s.phone_number}`}
              options={SIM_OPTIONS}
              value={simState[s.id].action}
              comment={simState[s.id].comment}
              onChange={(action) => setSimState((prev) => ({ ...prev, [s.id]: { ...prev[s.id], action } }))}
              onComment={(comment) => setSimState((prev) => ({ ...prev, [s.id]: { ...prev[s.id], comment } }))}
            />
          ))}
        </div>
      ) : null}

      {activePasses.length > 0 ? (
        <div style={{ margin: '14px 0' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>Средства доступа</div>
          {activePasses.map((p) => (
            <DispositionRow
              key={p.id}
              label={passLabel(p)}
              options={PASS_OPTIONS}
              value={passState[p.id].action}
              comment={passState[p.id].comment}
              onChange={(action) => setPassState((prev) => ({ ...prev, [p.id]: { ...prev[p.id], action } }))}
              onComment={(comment) => setPassState((prev) => ({ ...prev, [p.id]: { ...prev[p.id], comment } }))}
            />
          ))}
        </div>
      ) : null}

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
