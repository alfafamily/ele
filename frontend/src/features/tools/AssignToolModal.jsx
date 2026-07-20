import { useEffect, useMemo, useState } from 'react'
import { apiGet } from '../../shared/api/client'
import { Banner, Button, Icon, Input, Modal, Spinner } from '../../shared/ui'
import { StoragePicker } from './StoragePicker.jsx'
import { assignUnits } from './toolsApi.js'

// Закрепление инструмента за сотрудником с его карточки: выбор инструмента со
// свободным остатком (список + поиск, одиночный выбор) + количество + склад.
export function AssignToolModal({ employeeId, onClose, onDone }) {
  const [tools, setTools] = useState(null)
  const [toolId, setToolId] = useState('')
  const [query, setQuery] = useState('')
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
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (tools || []).filter((t) => !q || t.name.toLowerCase().includes(q))
  }, [tools, query])

  const pickTool = (t) => {
    setToolId(String(t.id))
    setFromPlace('')
  }
  const clearTool = () => {
    setToolId('')
    setFromPlace('')
    setQuery('')
  }

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
          <div>
            <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)', marginBottom: 6 }}>Инструмент <span style={{ color: 'var(--color-danger, #d9455f)' }}>*</span></div>
            {selected ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', background: 'var(--color-fill-input)', borderRadius: 10 }}>
                <Icon name="wrench" size={16} strokeWidth={2} style={{ color: 'var(--color-text-muted)', flex: 'none' }} />
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected.name}</span>
                  <span style={{ display: 'block', fontSize: 11.5, color: 'var(--color-text-placeholder)' }}>свободно {selected.free}</span>
                </span>
                <button type="button" onClick={clearTool} title="Изменить" aria-label="Изменить" style={{ width: 28, height: 28, flex: 'none', borderRadius: 8, background: 'var(--color-surface)', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'inset 0 0 0 1px var(--color-border)' }}>
                  <Icon name="x" size={15} strokeWidth={2} />
                </button>
              </div>
            ) : (
              <>
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Поиск инструмента"
                  style={{ width: '100%', height: 40, boxShadow: 'inset 0 0 0 1px var(--color-border)', borderRadius: 10, border: 'none', padding: '0 12px', fontSize: 13.5, fontFamily: 'inherit' }}
                />
                <div style={{ marginTop: 8, border: '1px solid var(--color-border)', borderRadius: 10, overflowY: 'auto', maxHeight: 216, padding: 4 }}>
                  {filtered.length === 0 ? (
                    <div style={{ padding: 12, fontSize: 13, color: 'var(--color-text-placeholder)', textAlign: 'center' }}>{query ? 'Ничего не найдено' : 'Нет инструментов'}</div>
                  ) : (
                    filtered.map((t) => (
                      <button key={t.id} type="button" onClick={() => pickTool(t)} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 11px', border: 'none', borderRadius: 8, background: 'transparent', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
                        <span style={{ minWidth: 0, flex: 1 }}>
                          <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
                          <span style={{ display: 'block', fontSize: 11.5, color: 'var(--color-text-placeholder)' }}>свободно {t.free}</span>
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
          {selected ? (
            <>
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
                max={String(sourceMax)}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
              <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)', marginTop: -8 }}>
                Доступно{fromPlace ? ' на складе' : ' без склада'}: {sourceMax}
              </div>
              <Input
                label="Комментарий"
                multiline
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Необязательный комментарий движения"
              />
            </>
          ) : null}
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
