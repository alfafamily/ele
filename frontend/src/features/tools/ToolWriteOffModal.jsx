import { useState } from 'react'
import { Banner, Button, Input, Modal } from '../../shared/ui'
import { writeOffTool } from './toolsApi.js'

// Списание всей карточки инструмента в архив: весь остаток уходит из обращения,
// закрепления открепляются.
export function ToolWriteOffModal({ tool, onClose, onDone }) {
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const submit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const updated = await writeOffTool(tool.id, comment.trim() || undefined)
      onDone(updated)
    } catch (err) {
      setError(err.detail || 'Не удалось списать инструмент.')
      setSubmitting(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Списать инструмент?">
      {error ? <Banner variant="error">{error}</Banner> : null}
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
      <div style={{ marginTop: 16 }}>
        <Input
          label="Комментарий (необязательно)"
          multiline
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Например: списано по акту №… (причина списания)"
        />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 18 }}>
        <Button variant="danger-solid" fullWidth loading={submitting} onClick={submit}>
          Списать
        </Button>
        <Button variant="secondary" fullWidth onClick={onClose}>
          Отмена
        </Button>
      </div>
    </Modal>
  )
}
