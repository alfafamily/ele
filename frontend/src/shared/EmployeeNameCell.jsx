import { splitName } from './employeeName.js'
import { AcceptanceIcon } from './AcceptanceIcon.jsx'

// B32. Ячейка «сотрудник» в списках объектов: иконка статуса акцепта + фамилия на
// первой строке (фамилия обрезается многоточием), имя — на второй; ниже —
// должность · отдел. Иконка и фамилия всегда на одной строке.
export function EmployeeNameCell({ name, position, department, status }) {
  const { last, first } = splitName(name)
  const pd = [position, department].filter(Boolean).join(' · ')
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
        <AcceptanceIcon status={status} size={15} />
        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{last}</span>
      </div>
      {first ? (
        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{first}</div>
      ) : null}
      {pd ? (
        <div style={{ color: 'var(--color-text-placeholder)', fontSize: 12.5, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pd}</div>
      ) : null}
    </div>
  )
}
