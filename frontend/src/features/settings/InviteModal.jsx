import { useState } from 'react'
import { EmployeePicker } from '../../shared/EmployeePicker.jsx'
import { Banner, Button, Checkbox, Icon, Input, Modal, Select } from '../../shared/ui'
import { MaintenanceTypeScope } from './MaintenanceTypeScope.jsx'
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
  const [canManageRegulations, setCanManageRegulations] = useState(false)
  const [maintenanceAllTypes, setMaintenanceAllTypes] = useState(true)
  const [maintenanceTypeIds, setMaintenanceTypeIds] = useState([])
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
  // B12: создаётся новый сотрудник-тёзка работающего — тоже подтверждение.
  // Список тёзок показываем отдельным блоком (визуально не как домен).
  const [needsDuplicateConfirm, setNeedsDuplicateConfirm] = useState(false)
  const [dupConflicts, setDupConflicts] = useState([])

  const onEmailChange = (e) => {
    setEmail(e.target.value)
    setNeedsDomainConfirm(false)
    setWarning(null)
  }

  // Смена ФИО нового сотрудника сбрасывает подтверждение дубля.
  const onDupFieldChange = (setter) => (e) => {
    setter(e.target.value)
    setNeedsDuplicateConfirm(false)
    setDupConflicts([])
    setWarning(null)
  }

  const submit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const maintainer = role === 'maintenance' || (role === 'accountant' && canMaintain)
      await inviteUser({
        email,
        role,
        is_observer: role === 'employee' ? isObserver : false,
        can_maintain: role === 'accountant' ? canMaintain : false,
        can_manage_regulations: role === 'accountant' ? canManageRegulations : false,
        maintenance_all_types: maintainer ? maintenanceAllTypes : true,
        maintenance_types: maintainer && !maintenanceAllTypes ? maintenanceTypeIds : [],
        confirm_domain: needsDomainConfirm,
        confirm_duplicate: needsDuplicateConfirm,
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
      } else if (err.status === 409 && err.data?.requires_duplicate_confirmation) {
        // Домен (если был) уже подтверждён — убираем его баннер и показываем
        // отдельный блок про дубль со списком тёзок.
        setWarning(null)
        setDupConflicts(err.data.duplicates || [])
        setNeedsDuplicateConfirm(true)
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
      {error ? (
        <div style={{ marginBottom: 14 }}>
          <Banner variant="error">{error}</Banner>
        </div>
      ) : null}
      {warning ? (
        <div style={{ marginBottom: 14 }}>
          <Banner variant="warning">{warning}</Banner>
        </div>
      ) : null}
      {needsDuplicateConfirm ? (
        <div
          style={{
            marginBottom: 14,
            padding: '12px 14px',
            borderRadius: 10,
            border: '1px solid var(--color-warning)',
            background: 'var(--color-warning-bg)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, marginBottom: 6 }}>
            <Icon name="triangle-alert" size={18} strokeWidth={2} style={{ color: 'var(--color-warning)', flex: 'none' }} />
            Сотрудник с такими данными уже есть
          </div>
          <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.5, marginBottom: dupConflicts.length ? 6 : 0 }}>
            В системе уже работают сотрудники с такими Фамилией и Именем. Возможно, это тот же человек.
            Всё равно создать нового?
          </div>
          {dupConflicts.map((d) => (
            <div key={d.id} style={{ fontSize: 13 }}>
              • {d.full_name}
              {d.user_email ? (
                <span style={{ color: 'var(--color-text-placeholder)' }}> — учётная запись: {d.user_email}</span>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
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
              <Input label="Фамилия" required value={empLastName} onChange={onDupFieldChange(setEmpLastName)} />
              <Input label="Имя" required value={empFirstName} onChange={onDupFieldChange(setEmpFirstName)} />
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
          <>
            <Checkbox label="Может управлять регламентами ТО" checked={canManageRegulations} onChange={setCanManageRegulations} />
            <Checkbox label="Ответственный за ТО" checked={canMaintain} onChange={setCanMaintain} />
          </>
        ) : null}
        {role === 'maintenance' || (role === 'accountant' && canMaintain) ? (
          <MaintenanceTypeScope
            allTypes={maintenanceAllTypes}
            typeIds={maintenanceTypeIds}
            onChange={({ allTypes, typeIds }) => {
              setMaintenanceAllTypes(allTypes)
              setMaintenanceTypeIds(typeIds)
            }}
          />
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
          {needsDuplicateConfirm ? 'Всё равно создать' : needsDomainConfirm ? 'Всё равно пригласить' : 'Отправить приглашение'}
        </Button>
      </div>
    </Modal>
  )
}
