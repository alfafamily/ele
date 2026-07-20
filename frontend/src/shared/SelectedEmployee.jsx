import { nameInitials } from './employeeName'
import { Icon } from './ui/Icon/Icon.jsx'

// Свёрнутый вид выбранного сотрудника — единый с выбранным местом в PlaceSelect:
// блок с заливкой, аватар/инициалы + ФИО, справа крестик для сброса выбора.
export function SelectedEmployee({ employee, onClear }) {
  const subtitle = [employee.position, employee.department].filter(Boolean).join(' · ')
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', background: 'var(--color-fill-input)', borderRadius: 10 }}>
      <span style={{ width: 30, height: 30, flex: 'none', borderRadius: '50%', background: 'var(--color-fill-active-tint)', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, overflow: 'hidden' }}>
        {employee.avatar ? (
          <img src={employee.avatar.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          nameInitials(employee.full_name || employee.name)
        )}
      </span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{employee.full_name || employee.name}</span>
        {subtitle ? (
          <span style={{ display: 'block', fontSize: 11.5, color: 'var(--color-text-placeholder)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subtitle}</span>
        ) : null}
      </span>
      {onClear ? (
        <button type="button" onClick={onClear} title="Изменить" aria-label="Изменить" style={{ width: 28, height: 28, flex: 'none', borderRadius: 8, background: 'var(--color-surface)', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'inset 0 0 0 1px var(--color-border)' }}>
          <Icon name="x" size={15} strokeWidth={2} />
        </button>
      ) : null}
    </div>
  )
}
