import { useMemo, useState } from 'react'
import { Banner, Button, Input, Modal } from '../../shared/ui'
import { StoragePicker } from './StoragePicker.jsx'
import { transferUnits } from './toolsApi.js'

// Перемещение свободного остатка инструмента на склад. Источник — склад с
// остатком ИЛИ системный остаток «без склада» (unplacedFree>0): «Без склада»
// доступно как источник (расход), но никогда как приёмник. Приёмник — только
// реальный склад.
export function ToolTransferModal({ tool, storages, unplacedFree = 0, onClose, onDone }) {
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
  const noneAllowed = unplacedFree > 0
  const fromMax = fromId ? freeMap[String(fromId)] || 0 : unplacedFree
  const empty = storages.length === 0 && !noneAllowed

  const submit = async () => {
    const qty = Number(quantity)
    if (!fromId && !noneAllowed) return setError('Выберите склад-источник.')
    if (!toId) return setError('Выберите склад-приёмник.')
    if (fromId && String(fromId) === String(toId)) return setError('Склады должны различаться.')
    if (!Number.isInteger(qty) || qty <= 0) return setError('Количество должно быть больше нуля.')
    if (qty > fromMax) return setError(`Доступно не больше ${fromMax}.`)
    setSubmitting(true)
    setError(null)
    try {
      await transferUnits(tool.id, {
        quantity: qty,
        fromPlace: fromId ? Number(fromId) : undefined, // без from_place — источник «без склада»
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
    <Modal open onClose={onClose} title="Переместить на склад">
      {error ? <Banner variant="error">{error}</Banner> : null}
      {empty ? (
        <div style={{ fontSize: 13.5, color: 'var(--color-text-muted)', padding: '8px 0 4px' }}>
          Нет остатка для перемещения.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 4 }}>
          <StoragePicker
            label="Со склада"
            required={!noneAllowed}
            value={fromId}
            onChange={setFromId}
            freeMap={freeMap}
            restrictToStock
            showQuantity
            allowNone={noneAllowed}
            noneQty={unplacedFree}
          />
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
          <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)', marginTop: -8 }}>
            Доступно{fromId ? ' на складе' : ' без склада'}: {fromMax}
          </div>
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
          Переместить
        </Button>
      </div>
    </Modal>
  )
}
