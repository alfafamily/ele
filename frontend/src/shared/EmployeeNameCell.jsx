import { splitName } from './employeeName.js'
import { AcceptanceIcon } from './AcceptanceIcon.jsx'
import { TruncatedText } from './TruncatedText.jsx'

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
        <TruncatedText as="span" style={{ minWidth: 0 }}>{last}</TruncatedText>
      </div>
      {first ? (
        <TruncatedText>{first}</TruncatedText>
      ) : null}
      {pd ? (
        <TruncatedText style={{ color: 'var(--color-text-placeholder)', fontSize: 12.5, marginTop: 2 }}>{pd}</TruncatedText>
      ) : null}
    </div>
  )
}
