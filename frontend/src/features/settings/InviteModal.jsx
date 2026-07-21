import { useState } from 'react'
import { EmployeePicker } from '../../shared/EmployeePicker.jsx'
import { Banner, Button, Checkbox, Input, Modal, Select } from '../../shared/ui'
import { inviteUser } from './settingsApi.js'

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Администратор' },
  { value: 'accountant', label: 'Ответственный за учёт' },
  { value: 'maintenance', label: 'Ответственный за ТО' },
  { value: 'employee', label: 'Сотрудник' },
]

// S4 — приглашение пользователя : роль/Сотрудник/Наблюдатель
// сразу в модалке. Жёсткой блокировки по домену нет — только предупреждение,
// возвращаемое сервером в успешном ответе.
export function InviteModal({ onClose, onInvited }) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('employee')
  const [employee, setEmployee] = useState(null)
  const [showEmployeePicker, setShowEmployeePicker] = useState(false)
  const [isObserver, setIsObserver] = useState(false)
  const [canMaintain, setCanMaintain] = useState(false)
  // Свитч «Добавить сотрудника»: создаём нового Сотрудника вместе с приглашением
  // (взаимоисключающе с выбором существующего).
  const [createEmployee, setCreateEmployee] = useState(false)
  const [empLastName, setEmpLastName] = useState('')
  const [empFirstName, setEmpFirstName] = useState('')
  const [empDepartment, setEmpDepartment] = useState('')
  const [empPosition, setEmpPosition] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [warning, setWarning] = useState(null)
  // Домен email отличается от домена компании — требуем подтверждения:
  // первый сабмит показывает предупреждение, второй (с confirm_domain) шлёт.
  const [needsDomainConfirm, setNeedsDomainConfirm] = useState(false)

  const onEmailChange = (e) => {
    setEmail(e.target.value)
    setNeedsDomainConfirm(false)
    setWarning(null)
  }

  const submit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      await inviteUser({
        email,
        role,
        is_observer: role === 'employee' ? isObserver : false,
        can_maintain: role === 'accountant' ? canMaintain : false,
        confirm_domain: needsDomainConfirm,
        ...(createEmployee
          ? {
              create_employee: true,
              last_name: empLastName,
              first_name: empFirstName,
              department: empDepartment,
              position: empPosition,
            }
          : { employee_id: employee?.id }),
      })
      onInvited()
    } catch (err) {
      if (err.status === 409 && err.data?.requires_domain_confirmation) {
        setWarning(err.detail)
        setNeedsDomainConfirm(true)
      } else {
        setError(err.errors ? Object.values(err.errors).flat().join(' ') : err.detail || 'Не удалось отправить приглашение.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Пригласить пользователя">
      <p style={{ fontSize: 13.5, color: 'var(--color-text-muted)', marginBottom: 18, marginTop: -6 }}>
        На указанный email придёт ссылка-приглашение.
      </p>
      {error ? <Banner variant="error">{error}</Banner> : null}
      {warning ? <Banner variant="warning">{warning}</Banner> : null}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Input label="Email" type="email" required value={email} onChange={onEmailChange} />
        <Select label="Роль" required value={role} onChange={setRole}>
          {ROLE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>

        <Checkbox
          label="Добавить сотрудника"
          checked={createEmployee}
          onChange={(v) => {
            setCreateEmployee(v)
            if (v) setEmployee(null) // взаимоисключаем с выбором существующего
          }}
        />

        {createEmployee ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Input label="Фамилия" required value={empLastName} onChange={(e) => setEmpLastName(e.target.value)} />
              <Input label="Имя" required value={empFirstName} onChange={(e) => setEmpFirstName(e.target.value)} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Input label="Отдел" value={empDepartment} onChange={(e) => setEmpDepartment(e.target.value)} />
              <Input label="Должность" value={empPosition} onChange={(e) => setEmpPosition(e.target.value)} />
            </div>
          </>
        ) : showEmployeePicker ? (
          <EmployeePicker
            autoFocus
            onSelect={(emp) => {
              setEmployee(emp)
              setShowEmployeePicker(false)
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setShowEmployeePicker(true)}
            style={{
              width: '100%',
              minHeight: 52,
              background: 'var(--color-fill-input)',
              border: 'none',
              borderRadius: 10,
              padding: '8px 14px',
              textAlign: 'left',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)' }}>Существующий сотрудник</div>
            <div style={{ fontSize: 15, color: employee ? 'var(--color-text-primary)' : 'var(--color-text-placeholder)' }}>{employee?.full_name || 'Не выбран'}</div>
          </button>
        )}

        {role === 'employee' ? (
          <Checkbox label="Признак «Наблюдатель» (только для роли «Сотрудник»)" checked={isObserver} onChange={setIsObserver} />
        ) : null}
        {role === 'accountant' ? (
          <Checkbox label="Ответственный за регламенты и проведение ТО" checked={canMaintain} onChange={setCanMaintain} />
        ) : null}
      </div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 22 }}>
        <Button variant="secondary" onClick={onClose}>
          Отмена
        </Button>
        <Button
          loading={submitting}
          disabled={!email.trim() || (createEmployee && (!empLastName.trim() || !empFirstName.trim()))}
          onClick={submit}
        >
          {needsDomainConfirm ? 'Всё равно пригласить' : 'Отправить приглашение'}
        </Button>
      </div>
    </Modal>
  )
}
