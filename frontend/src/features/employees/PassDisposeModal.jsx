import { useState } from 'react'
import { Banner, Button, Input, Modal } from '../../shared/ui'
import { utilizePass } from './employeesApi.js'

// Утилизация средства доступа (пропуск или ключ) — терминальное действие: либо
// выбросить (утилизировать), либо передать арендодателю. Открепление
// размещённого средства вынесено отдельной операцией в блок «Размещение».
// Комментарий (необязательный, многострочный) попадает в историю движений.
const OPTIONS = [
  { value: 'utilized', label: 'Утилизировать', hint: 'Выбросить. Необратимо, уйдёт во вкладку «Утилизировано».' },
  { value: 'handed', label: 'Передать арендодателю', hint: 'Отдан арендодателю. Необратимо, уйдёт во вкладку «Утилизировано».' },
]

export function PassDisposeModal({ pass, onClose, onDone }) {
  const kind = pass.object_type === 'key' ? 'ключ' : 'пропуск'
  const [choice, setChoice] = useState(OPTIONS[0].value)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const submit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const saved = await utilizePass(pass.id, choice, comment.trim() || undefined)
      onDone(saved)
    } catch (err) {
      setError(err.detail || 'Не удалось выполнить действие.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={`Утилизировать ${kind}?`}>
      {error ? <Banner variant="error">{error}</Banner> : null}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, margin: '4px 0 16px' }}>
        {OPTIONS.map((opt) => (
          <label
            key={opt.value}
            className={'ele-option' + (choice === opt.value ? ' ele-option--selected' : '')}
          >
            <input type="radio" name="dispose" checked={choice === opt.value} onChange={() => setChoice(opt.value)} style={{ marginTop: 2 }} />
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 14, fontWeight: 600 }}>{opt.label}</span>
              <span style={{ display: 'block', fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: 2 }}>{opt.hint}</span>
            </span>
          </label>
        ))}
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
