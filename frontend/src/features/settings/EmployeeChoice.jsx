import { Link } from 'react-router-dom'
import { EmployeePicker } from '../../shared/EmployeePicker.jsx'
import { nameInitials } from '../../shared/employeeName.js'
import { Input } from '../../shared/ui'

// Выбор сотрудника для Пользователя — по образцу размещения при создании
// Оборудования: сегментированный переключатель с тремя вариантами.
//  • 'none'     — «Без сотрудника» (для Пользователя сотрудник не указывается);
//  • 'existing' — «Указать сотрудника» (выбор из существующих через EmployeePicker);
//  • 'create'   — «Создать сотрудника» (поля данных нового сотрудника; только при
//                 приглашении — управляется пропсом allowCreate).
// Заменяет прежнюю галку «Добавить сотрудника» и убирает состояние «не выбрано».
export function EmployeeChoice({
  allowCreate = false,
  mode,
  onModeChange,
  employee,
  onSelectEmployee,
  // Поля создания нового сотрудника (нужны только при allowCreate).
  lastName = '',
  firstName = '',
  department = '',
  position = '',
  onLastName,
  onFirstName,
  onDepartment,
  onPosition,
}) {
  const segments = [
    { value: 'none', label: 'Без сотрудника' },
    { value: 'existing', label: 'Указать сотрудника' },
    ...(allowCreate ? [{ value: 'create', label: 'Создать сотрудника' }] : []),
  ]

  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)', marginBottom: 6 }}>Сотрудник</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {segments.map((s) => (
          <button
            key={s.value}
            type="button"
            onClick={() => onModeChange(s.value)}
            style={{
              flex: 1,
              padding: '8px 6px',
              fontSize: 12.5,
              fontWeight: 600,
              borderRadius: 8,
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
              color: mode === s.value ? 'var(--color-primary-text)' : 'var(--color-text-secondary)',
              background: mode === s.value ? 'var(--color-primary)' : 'var(--color-fill-input)',
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {mode === 'existing' ? (
        employee ? (
          <SelectedEmployee employee={employee} onChange={() => onSelectEmployee(null)} />
        ) : (
          <EmployeePicker autoFocus onSelect={onSelectEmployee} />
        )
      ) : null}

      {mode === 'create' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Input label="Фамилия" required value={lastName} onChange={onLastName} />
            <Input label="Имя" required value={firstName} onChange={onFirstName} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Input label="Отдел" value={department} onChange={onDepartment} />
            <Input label="Должность" value={position} onChange={onPosition} />
          </div>
        </div>
      ) : null}
    </div>
  )
}

// Выбранный существующий сотрудник — карточка как «Закреплено за» у Оборудования:
// аватар + имя-ссылка на карточку + действия «Изменить»/«Убрать».
function SelectedEmployee({ employee, onChange }) {
  return (
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
          overflow: 'hidden',
        }}
      >
        {employee.avatar ? (
          <img src={employee.avatar.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          nameInitials(employee.full_name)
        )}
      </span>
      <Link to={`/employees/${employee.id}`} style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>
        {employee.full_name}
      </Link>
      <button
        type="button"
        onClick={onChange}
        style={{ border: 'none', background: 'none', color: 'var(--color-text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 4 }}
      >
        Изменить
      </button>
    </div>
  )
}
