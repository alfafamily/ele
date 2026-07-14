import { useState } from 'react'
import { Link } from 'react-router-dom'
import { EmployeePicker } from '../../shared/EmployeePicker.jsx'
import { Banner, Button, Checkbox, Modal, Select } from '../../shared/ui'
import { updateUser } from './settingsApi.js'

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Администратор' },
  { value: 'accountant', label: 'Ответственный за учёт' },
  { value: 'employee', label: 'Сотрудник' },
]

// Карточка Пользователя — смена Роли, привязка/отвязка
// Сотрудника, признак «Наблюдатель». Флаг «Наблюдатель» показывается только
// для роли «Сотрудник»; при иной роли значение в БД сохраняется, но в форме
// скрыто — поэтому при сохранении не роли «Сотрудник» отправляем false.
export function EditUserModal({ user, onClose, onSaved }) {
  const [role, setRole] = useState(user.role)
  // { id, full_name } | null. Инициализируем из связанного Сотрудника, если есть.
  const [employee, setEmployee] = useState(user.employee ? { id: user.employee, full_name: user.employee_name } : null)
  const [showEmployeePicker, setShowEmployeePicker] = useState(false)
  const [isObserver, setIsObserver] = useState(user.is_observer)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const submit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      await updateUser(user.id, {
        role,
        employee: employee?.id ?? null,
        is_observer: role === 'employee' ? isObserver : false,
      })
      onSaved()
    } catch (err) {
      setError(err.errors ? Object.values(err.errors).flat().join(' ') : err.detail || 'Не удалось сохранить изменения.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Пользователь">
      <p style={{ fontSize: 13.5, color: 'var(--color-text-muted)', marginBottom: 18, marginTop: -6 }}>{user.email}</p>
      {error ? <Banner variant="error">{error}</Banner> : null}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Select label="Роль" required value={role} onChange={setRole}>
          {ROLE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>

        <div>
          <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)', marginBottom: 6 }}>Связанный сотрудник</div>
          {showEmployeePicker ? (
            <EmployeePicker
              autoFocus
              onSelect={(emp) => {
                setEmployee(emp)
                setShowEmployeePicker(false)
              }}
            />
          ) : employee ? (
            // Блок как «Закреплено за» у Оборудования: аватар + имя-ссылка на
            // карточку Сотрудника, действия встроены рядом.
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: 'var(--color-fill-input)', borderRadius: 10 }}>
              <span
                style={{
                  width: 38,
                  height: 38,
                  flex: 'none',
                  borderRadius: '50%',
                  background: 'var(--color-surface)',
                  color: 'var(--color-text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                {employee.full_name?.slice(0, 2).toUpperCase()}
              </span>
              <Link to={`/employees/${employee.id}`} style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                {employee.full_name}
              </Link>
              <button
                type="button"
                onClick={() => setShowEmployeePicker(true)}
                style={{ border: 'none', background: 'none', color: 'var(--color-text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 4 }}
              >
                Изменить
              </button>
              <button
                type="button"
                onClick={() => setEmployee(null)}
                style={{ border: 'none', background: 'none', color: 'var(--color-error)', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 4 }}
              >
                Отвязать
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowEmployeePicker(true)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 14px',
                background: 'var(--color-fill-input)',
                border: 'none',
                borderRadius: 10,
                textAlign: 'left',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: 14,
                color: 'var(--color-text-placeholder)',
              }}
            >
              <span
                style={{
                  width: 38,
                  height: 38,
                  flex: 'none',
                  borderRadius: '50%',
                  background: 'var(--color-surface)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C7C9D4" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="8" r="3.4" />
                  <path d="M5 20c0-3.5 3.1-6 7-6s7 2.5 7 6" />
                </svg>
              </span>
              Не связан — выбрать сотрудника
            </button>
          )}
        </div>

        {role === 'employee' ? (
          <Checkbox label="Признак «Наблюдатель» (только для роли «Сотрудник»)" checked={isObserver} onChange={setIsObserver} />
        ) : null}
      </div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 22 }}>
        <Button variant="secondary" onClick={onClose}>
          Отмена
        </Button>
        <Button loading={submitting} onClick={submit}>
          Сохранить
        </Button>
      </div>
    </Modal>
  )
}
