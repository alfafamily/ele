import { useState } from 'react'
import { Banner, Button, Input, Modal, PlaceSelect } from '../../shared/ui'
import { detachSimCard, utilizeSimCard } from './employeesApi.js'

// Открепление/утилизация SIM-карты. Размещённую (за сотрудником или в
// оборудовании) можно открепить на склад или утилизировать; свободную — только
// утилизировать. Комментарий (необязательный) для утилизации попадает в историю.
export function SimDisposeModal({ sim, onClose, onDone }) {
  const attached = Boolean(sim.employee || sim.equipment)
  // E-SIM виртуальна — на складе не хранится, место при откреплении не нужно.
  const isEsim = sim.sim_type === 'esim'
  const [storagePlaceId, setStoragePlaceId] = useState('')

  const OPTIONS = attached
    ? [
        { value: 'detach', label: 'Открепить', hint: 'Открепить от сотрудника — станет неиспользуемой, можно выдать снова.' },
        { value: 'utilized', label: 'Утилизировать', hint: 'Необратимо, уйдёт во вкладку «Утилизировано».' },
      ]
    : [{ value: 'utilized', label: 'Утилизировать', hint: 'Необратимо, уйдёт во вкладку «Утилизировано».' }]

  const [choice, setChoice] = useState(OPTIONS[0].value)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const isUtilize = choice === 'utilized'

  const submit = async () => {
    if (choice === 'detach' && !isEsim && !storagePlaceId) {
      setError('Выберите место хранения.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const saved = choice === 'detach'
        ? await detachSimCard(sim.id, Number(storagePlaceId))
        : await utilizeSimCard(sim.id, comment.trim() || undefined)
      onDone(saved)
    } catch (err) {
      setError(err.detail || 'Не удалось выполнить действие.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={attached ? 'Что сделать с SIM-картой?' : 'Утилизировать SIM-карту?'}>
      {error ? <Banner variant="error">{error}</Banner> : null}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, margin: '4px 0 16px' }}>
        {OPTIONS.map((opt) => (
          <label
            key={opt.value}
            className={'ele-option' + (choice === opt.value ? ' ele-option--selected' : '')}
          >
            <input type="radio" name="sim-dispose" checked={choice === opt.value} onChange={() => setChoice(opt.value)} style={{ marginTop: 2 }} />
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 14, fontWeight: 600 }}>{opt.label}</span>
              <span style={{ display: 'block', fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: 2 }}>{opt.hint}</span>
            </span>
          </label>
        ))}
      </div>

      {choice === 'detach' && !isEsim ? (
        <div style={{ marginBottom: 18 }}>
          <PlaceSelect placeType="storage" required value={storagePlaceId} onChange={setStoragePlaceId} />
        </div>
      ) : null}

      {isUtilize ? (
        <div style={{ marginBottom: 18 }}>
          <Input
            label="Комментарий (необязательно)"
            multiline
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Например: утилизировано по акту №…"
          />
        </div>
      ) : null}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Button variant={isUtilize ? 'danger-solid' : 'primary'} fullWidth loading={submitting} onClick={submit}>
          {choice === 'detach' ? 'Открепить' : 'Утилизировать'}
        </Button>
        <Button variant="secondary" fullWidth onClick={onClose}>Отмена</Button>
      </div>
    </Modal>
  )
}
