import { useState } from 'react'
import { Button, Modal } from '../../shared/ui'

// B32. Отказ сотрудника от закрепления — с обязательной причиной (уходит в
// историю). Подтверждение «Отклонить» (красная) / «Отмена».
export function RejectAssignmentModal({ assignment, onConfirm, onClose }) {
  const [comment, setComment] = useState('')
  const [loading, setLoading] = useState(false)
  const label = assignment.object_label || assignment.object_kind_display

  const confirm = async () => {
    if (!comment.trim()) return
    setLoading(true)
    try {
      await onConfirm(comment.trim())
    } catch {
      setLoading(false)
      return
    }
    onClose()
  }

  return (
    <Modal open onClose={onClose} title="Отклонить получение">
      <div style={{ fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 1.5, margin: '4px 0 12px' }}>
        Укажите причину отказа от «{label}» — она попадёт в историю.
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Причина отказа"
        rows={3}
        autoFocus
        style={{ width: '100%', resize: 'vertical', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--color-border)', background: 'var(--color-fill-input)', font: 'inherit', fontSize: 14, boxSizing: 'border-box', marginBottom: 16 }}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Button variant="danger" fullWidth loading={loading} disabled={!comment.trim()} onClick={confirm}>Отклонить</Button>
        <Button variant="secondary" fullWidth onClick={onClose}>Отмена</Button>
      </div>
    </Modal>
  )
}
