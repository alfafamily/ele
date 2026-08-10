import { TerminalActionModal } from '../../shared/ui'
import { writeOffTransport } from './transportApi.js'

// B3. Списание транспорта в архив с необязательным комментарием (причина).
export function WriteOffModal({ transport, onClose, onDone }) {
  return (
    <TerminalActionModal
      title="Списать транспорт?"
      submitLabel="Списать"
      onConfirm={(comment) => writeOffTransport(transport.id, comment)}
      onClose={onClose}
      onDone={onDone}
      errorFallback="Не удалось списать транспорт."
      commentPlaceholder="Например: списано по акту №… (причина списания)"
    >
      <p style={{ fontSize: 14, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
        Объект <b style={{ color: 'var(--color-text-primary)' }}>{transport.type_and_model}</b> будет перемещён в
        архив. Восстановление из архива через интерфейс не предусмотрено.
      </p>
    </TerminalActionModal>
  )
}
