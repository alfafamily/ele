import { useState } from 'react'
import { EmployeePicker } from '../../shared/EmployeePicker.jsx'
import { Banner, Button, Input, Modal } from '../../shared/ui'

// Модалка движения количественной карточки: приход / списание единиц /
// закрепление / открепление. Поле количества + необязательный комментарий.
// Режимы:
//   mode='plain'          — количество + комментарий (приход, списание единиц);
//   mode='assign'         — сначала выбор сотрудника, затем количество (закрепить);
//   mode='fixed-employee' — сотрудник задан заранее (открепить конкретное закрепление).
// max — клиентский предел (свободный остаток / закреплено за сотрудником);
// onSubmit(quantity, comment, employeeId) — асинхронный, ошибку отдаёт .detail.
export function QuantityMoveModal({
  title,
  confirmLabel,
  mode = 'plain',
  fixedEmployee = null,
  max,
  onSubmit,
  onClose,
}) {
  const [employee, setEmployee] = useState(fixedEmployee)
  const [quantity, setQuantity] = useState('1')
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const needEmployee = mode === 'assign' || mode === 'fixed-employee'

  const submit = async () => {
    const qty = Number(quantity)
    if (!Number.isInteger(qty) || qty <= 0) {
      setError('Количество должно быть больше нуля.')
      return
    }
    if (typeof max === 'number' && qty > max) {
      setError(`Доступно не больше ${max}.`)
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await onSubmit(qty, comment.trim(), employee?.id)
    } catch (err) {
      setError(err.detail || (err.errors ? Object.values(err.errors).flat().join(' ') : 'Не удалось выполнить операцию.'))
      setSubmitting(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={title}>
      {error ? <Banner variant="error">{error}</Banner> : null}

      {/* Закрепление: пока сотрудник не выбран — показываем подбор. */}
      {mode === 'assign' && !employee ? (
        <div style={{ marginTop: 4 }}>
          <div style={{ fontSize: 13, color: 'var(--color-text-placeholder)', marginBottom: 8 }}>Выберите сотрудника</div>
          <EmployeePicker autoFocus onSelect={setEmployee} />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {needEmployee ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)' }}>Сотрудник</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{employee?.full_name || employee?.name}</div>
              </div>
              {mode === 'assign' ? (
                <button
                  type="button"
                  onClick={() => setEmployee(null)}
                  style={{ fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: 'var(--color-text-muted)', background: 'var(--color-fill-input)', border: 'none', borderRadius: 8, padding: '5px 10px', cursor: 'pointer', flex: 'none' }}
                >
                  Изменить
                </button>
              ) : null}
            </div>
          ) : null}

          <Input
            label="Количество"
            required
            autoFocus={!needEmployee}
            type="number"
            min="1"
            {...(typeof max === 'number' ? { max: String(max) } : {})}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
          {typeof max === 'number' ? (
            <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)', marginTop: -8 }}>Доступно: {max}</div>
          ) : null}

          <Input
            label="Комментарий"
            multiline
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Необязательный комментарий движения"
          />

          <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
            <Button variant="secondary" fullWidth onClick={onClose}>
              Отмена
            </Button>
            <Button fullWidth loading={submitting} onClick={submit}>
              {confirmLabel}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
