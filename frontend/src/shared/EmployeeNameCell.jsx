import { AcceptanceIcon } from './AcceptanceIcon.jsx'
import { TruncatedText } from './TruncatedText.jsx'

// B32. Ячейка «сотрудник» в списках объектов: иконка статуса акцепта + «Фамилия
// Имя» одной строкой, когда помещается; если ширины не хватает — имя переносится
// на вторую строку, а лишнее обрезается многоточием (максимум 2 строки). Ниже —
// должность · отдел. B65: иконка — инлайновая (в потоке текста перед именем),
// поэтому при переносе вторая строка идёт от левого края (под иконкой), а не с
// отступом под первой строкой имени.
export function EmployeeNameCell({ name, position, department, status }) {
  const pd = [position, department].filter(Boolean).join(' · ')
  return (
    <div style={{ minWidth: 0 }}>
      <TruncatedText singleLine={false} className="ele-clamp-2" style={{ minWidth: 0, lineHeight: 1.3 }} text={name}>
        <AcceptanceIcon status={status} size={15} inline />
        {name}
      </TruncatedText>
      {pd ? (
        <TruncatedText style={{ color: 'var(--color-text-placeholder)', fontSize: 12.5, marginTop: 2 }}>{pd}</TruncatedText>
      ) : null}
    </div>
  )
}
