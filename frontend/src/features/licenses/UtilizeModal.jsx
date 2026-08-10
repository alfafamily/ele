import { TerminalActionModal } from '../../shared/ui'
import { utilizeLicense } from './licensesApi.js'

// L4 — утилизация: отвязывает от оборудования и переводит в архив,
// без варианта отмены из интерфейса .
export function UtilizeModal({ license, onClose, onDone }) {
  return (
    <TerminalActionModal
      title="Утилизировать лицензию?"
      submitLabel="Утилизировать"
      onConfirm={(comment) => utilizeLicense(license.id, comment)}
      onClose={onClose}
      onDone={onDone}
      errorFallback="Не удалось утилизировать лицензию."
      actionsStyle={{ marginTop: 20 }}
    >
      <p style={{ fontSize: 14, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
        Лицензия <b style={{ color: 'var(--color-text-primary)' }}>{license.license_type_name}</b> будет отвязана от оборудования и
        перемещена в архив. Восстановление из интерфейса не предусмотрено.
      </p>
    </TerminalActionModal>
  )
}
