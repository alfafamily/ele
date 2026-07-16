import { useState } from 'react'
import { Banner, Button, Input, Modal } from '../../shared/ui'
import { detachPass, utilizePass } from './employeesApi.js'

// Открепление/утилизация средства доступа (пропуск или ключ). Если объект
// закреплён за сотрудником — три варианта: открепить (деактивировать),
// утилизировать (выбросить), передать арендодателю. Если уже свободен —
// только два варианта утилизации. Комментарий (необязательный, многострочный)
// доступен для вариантов утилизации и попадает в историю движений.
export function PassDisposeModal({ pass, onClose, onDone }) {
  const attached = Boolean(pass.employee)
  const kind = pass.object_type === 'key' ? 'Ключ' : 'Пропуск'

  const OPTIONS = attached
    ? [
        { value: 'detach', label: 'Деактивировать', hint: 'Открепить от сотрудника — станет неиспользуемым, можно выдать снова.' },
        { value: 'utilized', label: 'Утилизировать', hint: 'Выбросить. Необратимо, уйдёт во вкладку «Утилизировано».' },
        { value: 'handed', label: 'Передать арендодателю', hint: 'Отдан арендодателю. Необратимо, уйдёт во вкладку «Утилизировано».' },
      ]
    : [
        { value: 'utilized', label: 'Утилизировать', hint: 'Выбросить. Необратимо, уйдёт во вкладку «Утилизировано».' },
        { value: 'handed', label: 'Передать арендодателю', hint: 'Отдан арендодателю. Необратимо, уйдёт во вкладку «Утилизировано».' },
      ]

  const [choice, setChoice] = useState(OPTIONS[0].value)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const isUtilize = choice === 'utilized' || choice === 'handed'

  const submit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const saved = choice === 'detach'
        ? await detachPass(pass.id)
        : await utilizePass(pass.id, choice, comment.trim() || undefined)
      onDone(saved)
    } catch (err) {
      setError(err.detail || 'Не удалось выполнить действие.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={attached ? `Что сделать с ${kind === 'Ключ' ? 'ключом' : 'пропуском'}?` : `Утилизировать ${kind === 'Ключ' ? 'ключ' : 'пропуск'}?`}>
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

      {isUtilize ? (
        <div style={{ marginBottom: 18 }}>
          <Input
            label="Комментарий (необязательно)"
            multiline
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Отобразится в истории движений"
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
