import { useMemo, useState } from 'react'
import { Banner, Button, Input, Modal, PlaceSelect, Select } from '../../shared/ui'
import { transferUnits } from './toolsApi.js'

// Перемещение свободного остатка инструмента с одного склада на другой.
// storages — складские размещения карточки [{place, place_name, place_location, quantity}].
export function ToolTransferModal({ tool, storages, onClose, onDone }) {
  const [fromId, setFromId] = useState('')
  const [toId, setToId] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const fromMax = useMemo(() => {
    const s = storages.find((a) => String(a.place) === String(fromId))
    return s ? s.quantity : 0
  }, [storages, fromId])

  const submit = async () => {
    const qty = Number(quantity)
    if (!fromId) return setError('Выберите склад-источник.')
    if (!toId) return setError('Выберите склад-приёмник.')
    if (String(fromId) === String(toId)) return setError('Склады должны различаться.')
    if (!Number.isInteger(qty) || qty <= 0) return setError('Количество должно быть больше нуля.')
    if (qty > fromMax) return setError(`Доступно не больше ${fromMax}.`)
    setSubmitting(true)
    setError(null)
    try {
      await transferUnits(tool.id, { quantity: qty, fromPlace: Number(fromId), toPlace: Number(toId), comment: comment.trim() })
      onDone()
    } catch (err) {
      setError(err.detail || 'Не удалось переместить.')
      setSubmitting(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Переместить между складами">
      {error ? <Banner variant="error">{error}</Banner> : null}
      {storages.length === 0 ? (
        <div style={{ fontSize: 13.5, color: 'var(--color-text-muted)', padding: '8px 0 4px' }}>
          Нет остатка на складах для перемещения.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 4 }}>
          <Select label="Со склада" required placeholder="Выберите склад" value={fromId} onChange={setFromId}>
            {storages.map((a) => (
              <option key={a.place} value={a.place}>
                {a.place_name} · {a.quantity} шт.
              </option>
            ))}
          </Select>
          <PlaceSelect placeType="storage" label="На склад" required value={toId} onChange={setToId} />
          <Input
            label="Количество"
            required
            type="number"
            min="1"
            max={String(fromMax)}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
          {fromId ? (
            <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)', marginTop: -8 }}>Доступно на складе: {fromMax}</div>
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
        <Button fullWidth loading={submitting} disabled={storages.length === 0} onClick={submit}>
          Переместить
        </Button>
      </div>
    </Modal>
  )
}
