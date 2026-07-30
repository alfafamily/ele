import { ConfirmModal } from '../../shared/ui'
import { DetachToStorageModal } from './DetachToStorageModal.jsx'
import { detachSimCard } from './employeesApi.js'

// Открепление SIM-карты от держателя (сотрудник/оборудование) — деактивирует и
// возвращает в свободный остаток. Обычная SIM кладётся на склад (выбор места);
// E-SIM виртуальна — склад не нужен (простое подтверждение). onDone вызывается
// после успешного открепления (родитель закрывает модалку и перезагружает).
export function SimDetachModal({ sim, onClose, onDone }) {
  if (sim.sim_type === 'esim') {
    return (
      <ConfirmModal
        title="Открепить SIM-карту?"
        message={`E-SIM ${sim.phone_number} будет откреплена и станет неиспользуемой — её можно выдать снова.`}
        confirmLabel="Открепить"
        onConfirm={async () => {
          await detachSimCard(sim.id)
          onDone()
        }}
        onClose={onClose}
      />
    )
  }
  return (
    <DetachToStorageModal
      title="Открепить SIM-карту на склад"
      description={`SIM ${sim.phone_number} будет откреплена и положена на склад.`}
      onConfirm={async (storagePlaceId) => {
        await detachSimCard(sim.id, storagePlaceId)
        onDone()
      }}
      onClose={onClose}
    />
  )
}
