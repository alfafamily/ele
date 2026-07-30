import { DetachToStorageModal } from './DetachToStorageModal.jsx'
import { detachPass } from './employeesApi.js'

// Открепление средства доступа (пропуск/ключ) от держателя (сотрудник/транспорт)
// на склад — деактивирует и возвращает в свободный остаток. Место хранения
// обязательно. onDone вызывается после успешного открепления (родитель
// закрывает модалку и перезагружает).
export function PassDetachModal({ pass, onClose, onDone }) {
  const isKey = pass.object_type === 'key'
  return (
    <DetachToStorageModal
      title={`Открепить ${isKey ? 'ключ' : 'пропуск'} на склад`}
      description={`${isKey ? 'Ключ' : 'Пропуск'} будет откреплён и положен на склад.`}
      onConfirm={async (storagePlaceId) => {
        await detachPass(pass.id, storagePlaceId)
        onDone()
      }}
      onClose={onClose}
    />
  )
}
