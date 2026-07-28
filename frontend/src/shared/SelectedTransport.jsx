import { Icon } from './ui/Icon/Icon.jsx'

// Свёрнутый вид выбранной единицы транспорта — единый с SelectedEmployee: блок
// с заливкой, иконка + Тип/Модель, ниже — гос.номер и учётный номер, справа
// крестик для сброса выбора. Принимает как объект из пикера
// (type_and_model/plate/inventory_number), так и transport_detail пропуска.
export function SelectedTransport({ transport, onClear }) {
  const subtitle = [transport.plate, transport.inventory_number && `№ ${transport.inventory_number}`]
    .filter(Boolean)
    .join(' · ')
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', background: 'var(--color-fill-input)', borderRadius: 10 }}>
      <span style={{ width: 30, height: 30, flex: 'none', borderRadius: '50%', background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="car" size={17} strokeWidth={2} />
      </span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{transport.type_and_model}</span>
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
