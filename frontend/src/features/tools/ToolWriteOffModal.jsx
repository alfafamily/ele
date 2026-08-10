import { TerminalActionModal } from '../../shared/ui'
import { writeOffTool } from './toolsApi.js'

// Списание всей карточки инструмента в архив: весь остаток уходит из обращения,
// закрепления открепляются.
export function ToolWriteOffModal({ tool, onClose, onDone }) {
  return (
    <TerminalActionModal
      title="Списать инструмент?"
      submitLabel="Списать"
      onConfirm={(comment) => writeOffTool(tool.id, comment)}
      onClose={onClose}
      onDone={onDone}
      errorFallback="Не удалось списать инструмент."
      commentPlaceholder="Например: списано по акту №… (причина списания)"
    >
      <p style={{ fontSize: 14, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
        Инструмент <b style={{ color: 'var(--color-text-primary)' }}>{tool.name}</b> будет перемещён в архив.
        Восстановление из архива через интерфейс не предусмотрено.
      </p>
      <p style={{ fontSize: 13.5, color: 'var(--color-text-muted)', lineHeight: 1.5, marginTop: 10 }}>
        {tool.allocated > 0 ? (
          <>Всё закреплённое (<b style={{ color: 'var(--color-text-primary)' }}>{tool.allocated} шт.</b>) будет откреплено от сотрудников, а весь остаток{' '}</>
        ) : (
          <>Весь остаток{' '}</>
        )}
        <b style={{ color: 'var(--color-text-primary)' }}>{tool.quantity} шт.</b> будет списан.
      </p>
    </TerminalActionModal>
  )
}
