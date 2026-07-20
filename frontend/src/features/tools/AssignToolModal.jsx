import { useEffect, useMemo, useState } from 'react'
import { apiGet } from '../../shared/api/client'
import { Banner, Button, Input, Modal, Select, Spinner } from '../../shared/ui'
import { StoragePicker } from './StoragePicker.jsx'
import { assignUnits } from './toolsApi.js'

// Закрепление инструмента за сотрудником с его карточки: выбор инструмента со
// свободным остатком + количество + необязательный комментарий.
export function AssignToolModal({ employeeId, onClose, onDone }) {
  const [tools, setTools] = useState(null)
  const [toolId, setToolId] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [fromPlace, setFromPlace] = useState('')
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    apiGet('/api/tools/?tab=active')
      .then((data) => setTools((data.results || []).filter((t) => t.free > 0)))
      .catch(() => setTools([]))
  }, [])

  const selected = useMemo(() => (tools || []).find((t) => String(t.id) === String(toolId)), [tools, toolId])
  const freeMap = useMemo(
    () =>
      Object.fromEntries(
        (selected?.allocations || [])
          .filter((a) => a.kind === 'storage')
          .map((a) => [String(a.place), a.quantity])
      ),
    [selected]
  )
  // «Без склада» — системный остаток апгрейда: доступен как источник выдачи.
  const noneAllowed = Boolean(selected) && selected.free_unplaced > 0
  const sourceMax = fromPlace ? freeMap[String(fromPlace)] || 0 : selected?.free_unplaced ?? 0

  const submit = async () => {
    const qty = Number(quantity)
    if (!toolId) {
      setError('Выберите инструмент.')
      return
    }
    if (!Number.isInteger(qty) || qty <= 0) {
      setError('Количество должно быть больше нуля.')
      return
    }
    if (!noneAllowed && !fromPlace) {
      setError('Выберите склад, с которого выдаётся инструмент.')
      return
    }
    if (qty > sourceMax) {
      setError(`Доступно не больше ${sourceMax}.`)
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await assignUnits(Number(toolId), {
        quantity: qty,
        mode: 'mobile',
        employeeId,
        fromPlace: fromPlace ? Number(fromPlace) : undefined,
        comment: comment.trim(),
      })
      onDone()
    } catch (err) {
      setError(err.detail || 'Не удалось закрепить инструмент.')
      setSubmitting(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Закрепить инструмент">
      {error ? <Banner variant="error">{error}</Banner> : null}
      {tools === null ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}>
          <Spinner />
        </div>
      ) : tools.length === 0 ? (
        <div style={{ fontSize: 13.5, color: 'var(--color-text-muted)', padding: '8px 0 4px' }}>
          Нет инструментов со свободным остатком.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Select label="Инструмент" required placeholder="Выберите инструмент" value={toolId} onChange={setToolId}>
            {tools.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} · свободно {t.free}
              </option>
            ))}
          </Select>
          <StoragePicker
            label="Склад (откуда выдать)"
            required={!noneAllowed}
            value={fromPlace}
            onChange={setFromPlace}
            freeMap={freeMap}
            restrictToStock
            showQuantity
            allowNone={noneAllowed}
            noneQty={selected?.free_unplaced}
          />
          <Input
            label="Количество"
            required
            type="number"
            min="1"
            {...(selected ? { max: String(sourceMax) } : {})}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
          {selected ? (
            <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)', marginTop: -8 }}>
              Доступно{fromPlace ? ' на складе' : ' без склада'}: {sourceMax}
            </div>
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
        <Button fullWidth loading={submitting} disabled={!tools || tools.length === 0} onClick={submit}>
          Закрепить
        </Button>
      </div>
    </Modal>
  )
}
