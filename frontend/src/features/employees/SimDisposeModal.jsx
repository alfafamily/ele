import { useState } from 'react'
import { Banner, Button, Input, Modal } from '../../shared/ui'
import { utilizeSimCard } from './employeesApi.js'

// Утилизация SIM-карты (терминальное действие). Открепление размещённой SIM
// вынесено отдельной операцией в блок «Размещение» карточки. Комментарий
// (необязательный) попадает в историю.
export function SimDisposeModal({ sim, onClose, onDone }) {
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const submit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const saved = await utilizeSimCard(sim.id, comment.trim() || undefined)
      onDone(saved)
    } catch (err) {
      setError(err.detail || 'Не удалось выполнить действие.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Утилизировать SIM-карту?">
      {error ? <Banner variant="error">{error}</Banner> : null}
      <div style={{ fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 1.5, margin: '4px 0 16px' }}>
        Действие необратимо — SIM-карта уйдёт во вкладку «Утилизировано».
      </div>

      <div style={{ marginBottom: 18 }}>
        <Input
          label="Комментарий (необязательно)"
          multiline
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Например: утилизировано по акту №…"
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Button variant="danger-solid" fullWidth loading={submitting} onClick={submit}>
          Утилизировать
        </Button>
        <Button variant="secondary" fullWidth onClick={onClose}>Отмена</Button>
      </div>
    </Modal>
  )
}
