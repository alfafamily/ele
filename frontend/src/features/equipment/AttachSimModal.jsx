import { Link } from 'react-router-dom'
import { AttachSelectModal } from '../../shared/AttachSelectModal.jsx'
import { Button, Icon } from '../../shared/ui'
import { attachSimToEquipment } from '../employees/employeesApi.js'

// Установка SIM-карт в оборудование (симка в модеме и т.п.). Показываем свободные
// SIM (не за сотрудником и не в оборудовании, не утилизированные) для
// множественного выбора — по образцу привязки лицензий.
export function AttachSimModal({ equipment, onClose, onAttached }) {
  return (
    <AttachSelectModal
      title="Установить SIM-карту"
      subtitle={equipment.type_and_model}
      fetchPath="/api/sim-cards/?tab=deactivated"
      match={(s, q) => [s.phone_number, s.network_operator, s.provider].some((v) => (v || '').toLowerCase().includes(q))}
      renderRow={(sim) => {
        const details = [sim.network_operator, sim.provider].filter(Boolean).join(' / ') || 'без поставщика и оператора'
        return (
          <>
            <span style={{ font: '600 13.5px var(--font-mono)', display: 'block' }}>{sim.phone_number}</span>
            <div style={{ fontSize: 11.5, color: 'var(--color-text-placeholder)' }}>{`${sim.sim_type_display} · ${details}`}</div>
          </>
        )
      }}
      attach={(simId) => attachSimToEquipment(simId, equipment.id)}
      onAttached={onAttached}
      onClose={onClose}
      empty={{
        title: 'Нет свободных SIM-карт',
        description: 'Все SIM-карты закреплены за сотрудниками или оборудованием. Добавьте новую в разделе «Корпоративная связь».',
        action: (
          <Link to="/sim-cards/new">
            <Button><Icon name="plus" size={18} strokeWidth={2.2} />Создать SIM-карту</Button>
          </Link>
        ),
      }}
      submitLabel="Установить"
    />
  )
}
