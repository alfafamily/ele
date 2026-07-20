import { useMemo, useState } from 'react'
import { Banner, Button, Input, Modal } from '../../shared/ui'
import { StoragePicker } from './StoragePicker.jsx'
import { transferUnits } from './toolsApi.js'

// Перемещение свободного остатка инструмента на склад. По умолчанию — с одного
// склада на другой (storages — складские размещения карточки). При fromUnplaced
// источник — внутренний остаток «без склада» (unplacedQty), выбирается только
// склад-приёмник (для размещения легаси-остатка после обновления на 1.9.0).
export function ToolTransferModal({ tool, storages, fromUnplaced = false, unplacedQty = 0, onClose, onDone }) {
  const [fromId, setFromId] = useState('')
  const [toId, setToId] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const freeMap = useMemo(
    () => Object.fromEntries(storages.map((a) => [String(a.place), a.quantity])),
    [storages]
  )
  const fromMax = fromUnplaced ? unplacedQty : freeMap[String(fromId)] || 0
  const empty = !fromUnplaced && storages.length === 0

  const submit = async () => {
    const qty = Number(quantity)
    if (!fromUnplaced && !fromId) return setError('Выберите склад-источник.')
    if (!toId) return setError('Выберите склад-приёмник.')
    if (!fromUnplaced && String(fromId) === String(toId)) return setError('Склады должны различаться.')
    if (!Number.isInteger(qty) || qty <= 0) return setError('Количество должно быть больше нуля.')
    if (qty > fromMax) return setError(`Доступно не больше ${fromMax}.`)
    setSubmitting(true)
    setError(null)
    try {
      await transferUnits(tool.id, {
        quantity: qty,
        fromPlace: fromUnplaced ? undefined : Number(fromId),
        toPlace: Number(toId),
        comment: comment.trim(),
      })
      onDone()
    } catch (err) {
      setError(err.detail || 'Не удалось выполнить операцию.')
      setSubmitting(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={fromUnplaced ? 'Разместить остаток на склад' : 'Переместить между складами'}>
      {error ? <Banner variant="error">{error}</Banner> : null}
      {empty ? (
        <div style={{ fontSize: 13.5, color: 'var(--color-text-muted)', padding: '8px 0 4px' }}>
          Нет остатка на складах для перемещения.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 4 }}>
          {fromUnplaced ? (
            <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
              Источник — остаток без склада: <b>{unplacedQty} шт.</b>
            </div>
          ) : (
            <StoragePicker
              label="Со склада"
              required
              value={fromId}
              onChange={setFromId}
              freeMap={freeMap}
              restrictToStock
              showQuantity
            />
          )}
          <StoragePicker label="На склад" required value={toId} onChange={setToId} />
          <Input
            label="Количество"
            required
            type="number"
            min="1"
            max={String(fromMax)}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
          {fromUnplaced || fromId ? (
            <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)', marginTop: -8 }}>Доступно: {fromMax}</div>
          ) : null}
          <Input
            label="Комментарий"
            multiline
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Необязательный комментарий движения"
          />
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <Button variant="secondary" fullWidth onClick={onClose}>
          Отмена
        </Button>
        <Button fullWidth loading={submitting} disabled={empty} onClick={submit}>
          {fromUnplaced ? 'Разместить' : 'Переместить'}
        </Button>
      </div>
    </Modal>
  )
}
