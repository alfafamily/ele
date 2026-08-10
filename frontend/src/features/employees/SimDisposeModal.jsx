import { TerminalActionModal } from '../../shared/ui'
import { utilizeSimCard } from './employeesApi.js'

// Утилизация SIM-карты (терминальное действие). Открепление размещённой SIM
// вынесено отдельной операцией в блок «Размещение» карточки. Комментарий
// (необязательный) попадает в историю.
export function SimDisposeModal({ sim, onClose, onDone }) {
  return (
    <TerminalActionModal
      title="Утилизировать SIM-карту?"
      submitLabel="Утилизировать"
      onConfirm={(comment) => utilizeSimCard(sim.id, comment)}
      onClose={onClose}
      onDone={onDone}
      commentStyle={{ marginBottom: 18 }}
      actionsStyle={{}}
    >
      <div style={{ fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 1.5, margin: '4px 0 16px' }}>
        Действие необратимо — SIM-карта уйдёт во вкладку «Утилизировано».
      </div>
    </TerminalActionModal>
  )
}
