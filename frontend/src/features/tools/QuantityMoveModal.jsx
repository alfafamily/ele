import { useState } from 'react'
import { EmployeePicker } from '../../shared/EmployeePicker.jsx'
import { Banner, Button, Input, Modal, PlaceSelect } from '../../shared/ui'
import { StoragePicker } from './StoragePicker.jsx'

// Модалка движения количественной карточки (B8: остаток на складах). Слоты:
//   target = null            — без контрагента (приход / списание единиц);
//            'both'          — выбор: сотрудник (мобильно) или рабочее место;
//            {kind,id,name}  — контрагент задан заранее (возврат конкретного).
//   storage = null | 'add' | 'from' | 'to' — селект склада (куда/откуда).
// onSubmit({ quantity, comment, mode, employeeId, placeId, storagePlaceId }).
const STORAGE_LABEL = {
  add: 'Склад (куда оприходовать)',
  from: 'Склад (откуда выдать)',
  to: 'Склад (куда вернуть)',
  writeoff: 'Склад (откуда списать)',
}

export function QuantityMoveModal({
  title,
  confirmLabel,
  target = null,
  storage = null,
  storageRequired = false,
  storageFreeMap = {},
  unplacedFree,
  max,
  onSubmit,
  onClose,
}) {
  const fixed = target && typeof target === 'object' ? target : null
  const [mode, setMode] = useState(fixed?.kind === 'workplace' ? 'stationary' : 'mobile')
  const [employee, setEmployee] = useState(fixed?.kind === 'employee' ? fixed : null)
  const [placeId, setPlaceId] = useState('')
  const [storagePlaceId, setStoragePlaceId] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  // Для операций-расхода (выдача/списание) лимит зависит от выбранного склада:
  // если склад выбран — сколько на нём лежит; иначе — свободный остаток без склада.
  const sourceCap = storage === 'from' || storage === 'writeoff'
  const effectiveMax = sourceCap
    ? storagePlaceId
      ? storageFreeMap[String(storagePlaceId)] ?? 0
      : unplacedFree ?? 0
    : max

  const submit = async () => {
    const qty = Number(quantity)
    if (!Number.isInteger(qty) || qty <= 0) return setError('Количество должно быть больше нуля.')
    if (typeof effectiveMax === 'number' && qty > effectiveMax) return setError(`Доступно не больше ${effectiveMax}.`)
    if (target === 'both') {
      if (mode === 'mobile' && !employee) return setError('Выберите сотрудника.')
      if (mode === 'stationary' && !placeId) return setError('Выберите рабочее место.')
    }
    if (storage && storageRequired && !storagePlaceId) return setError('Выберите склад.')
    setSubmitting(true)
    setError(null)
    try {
      await onSubmit({
        quantity: qty,
        comment: comment.trim(),
        mode: fixed ? mode : target === 'both' ? mode : undefined,
        employeeId: employee?.id,
        placeId: placeId || fixed?.id,
        storagePlaceId,
      })
    } catch (err) {
      setError(err.detail || (err.errors ? Object.values(err.errors).flat().join(' ') : 'Не удалось выполнить операцию.'))
      setSubmitting(false)
    }
  }

  // Выбор контрагента для 'both': пока сотрудник в режиме mobile не выбран.
  const needEmployeePick = target === 'both' && mode === 'mobile' && !employee

  return (
    <Modal open onClose={onClose} title={title}>
      {error ? <Banner variant="error">{error}</Banner> : null}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 4 }}>
        {target === 'both' ? (
          <div style={{ display: 'flex', gap: 8 }}>
            {[
              { value: 'mobile', label: 'Сотруднику' },
              { value: 'stationary', label: 'На рабочее место' },
            ].map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => {
                  setMode(m.value)
                  setError(null)
                }}
                style={{
                  flex: 1,
                  padding: '8px 6px',
                  fontSize: 12.5,
                  fontWeight: 600,
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                  borderRadius: 8,
                  border: 'none',
                  color: mode === m.value ? 'var(--color-primary-text)' : 'var(--color-text-secondary)',
                  background: mode === m.value ? 'var(--color-primary)' : 'var(--color-fill-input)',
                }}
              >
                {m.label}
              </button>
            ))}
          </div>
        ) : null}

        {fixed ? (
          <div>
            <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)' }}>
              {fixed.kind === 'workplace' ? 'Рабочее место' : 'Сотрудник'}
            </div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{fixed.name}</div>
          </div>
        ) : null}

        {needEmployeePick ? (
          <div>
            <div style={{ fontSize: 13, color: 'var(--color-text-placeholder)', marginBottom: 8 }}>Выберите сотрудника</div>
            <EmployeePicker autoFocus onSelect={setEmployee} />
          </div>
        ) : null}

        {target === 'both' && mode === 'mobile' && employee ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)' }}>Сотрудник</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{employee.full_name || employee.name}</div>
            </div>
            <Button variant="secondary" onClick={() => setEmployee(null)}>
              Изменить
            </Button>
          </div>
        ) : null}

        {target === 'both' && mode === 'stationary' ? (
          <PlaceSelect placeType="workplace" required value={placeId} onChange={setPlaceId} />
        ) : null}

        {!needEmployeePick ? (
          <>
            {storage ? (
              <StoragePicker
                label={STORAGE_LABEL[storage]}
                required={storageRequired}
                value={storagePlaceId}
                onChange={setStoragePlaceId}
                freeMap={storageFreeMap}
                restrictToStock={sourceCap}
                showQuantity={sourceCap}
                allowNone={storage === 'to' ? true : !storageRequired}
                noneQty={unplacedFree}
              />
            ) : null}
            <Input
              label="Количество"
              required
              type="number"
              min="1"
              {...(typeof effectiveMax === 'number' ? { max: String(effectiveMax) } : {})}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
            {typeof effectiveMax === 'number' ? (
              <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)', marginTop: -8 }}>
                Доступно{sourceCap && storagePlaceId ? ' на складе' : sourceCap ? ' без склада' : ''}: {effectiveMax}
              </div>
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
          </>
        ) : null}
      </div>
    </Modal>
  )
}
