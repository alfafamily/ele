import { useState } from 'react'
import { Banner, Button, Icon, Input, Modal, Select } from '../../shared/ui'
import { performMaintenance } from './equipmentApi.js'
import { MAINTENANCE_STATUS_COLOR, MAINTENANCE_STATUS_LABEL } from './statusLabels.js'

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('ru-RU')
}

let nextRowId = 1

// B13. Провести ТО: дата следующего ТО (необязательна), позиции
// (Работы/Материалы) и комментарий. Пустую запись создать нельзя.
export function MaintenanceModal({ equipment, onClose, onDone }) {
  const [nextDate, setNextDate] = useState('')
  const [comment, setComment] = useState('')
  const [items, setItems] = useState([{ _id: nextRowId++, kind: 'work', name: '', quantity: '1' }])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const addRow = () => setItems((prev) => [...prev, { _id: nextRowId++, kind: 'material', name: '', quantity: '1' }])
  const removeRow = (id) => setItems((prev) => prev.filter((r) => r._id !== id))
  const patchRow = (id, patch) => setItems((prev) => prev.map((r) => (r._id === id ? { ...r, ...patch } : r)))

  const filledItems = items.filter((r) => r.name.trim())
  const hasContent = Boolean(nextDate) || Boolean(comment.trim()) || filledItems.length > 0

  const submit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const payload = {
        nextDate: nextDate || undefined,
        comment: comment.trim() || undefined,
        items: filledItems.map((r) => ({
          kind: r.kind,
          name: r.name.trim(),
          quantity: r.quantity === '' ? '0' : r.quantity,
        })),
      }
      const updated = await performMaintenance(equipment.id, payload)
      onDone(updated)
    } catch (err) {
      setError(err.errors ? Object.values(err.errors).flat().join(' ') : err.detail || 'Не удалось сохранить ТО.')
    } finally {
      setSubmitting(false)
    }
  }

  const status = equipment.maintenance_status

  return (
    <Modal open onClose={onClose} title="Провести ТО">
      {error ? <Banner variant="error">{error}</Banner> : null}

      {status ? (
        <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 16 }}>
          Текущий статус:{' '}
          <b style={{ color: MAINTENANCE_STATUS_COLOR[status] }}>{MAINTENANCE_STATUS_LABEL[status]}</b>
          {equipment.next_maintenance_date ? ` · плановая дата ${formatDate(equipment.next_maintenance_date)}` : ''}
        </div>
      ) : null}

      <Input
        label="Дата следующего ТО (необязательно)"
        type="date"
        value={nextDate}
        onChange={(e) => setNextDate(e.target.value)}
      />

      <div style={{ marginTop: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Работы и материалы</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map((row) => (
            <div key={row._id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <div style={{ width: 130, flex: 'none' }}>
                <Select value={row.kind} onChange={(v) => patchRow(row._id, { kind: v })}>
                  <option value="work">Работы</option>
                  <option value="material">Материалы</option>
                </Select>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Input
                  placeholder="Наименование"
                  value={row.name}
                  onChange={(e) => patchRow(row._id, { name: e.target.value })}
                />
              </div>
              <div style={{ width: 84, flex: 'none' }}>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  placeholder="Кол-во"
                  value={row.quantity}
                  onChange={(e) => patchRow(row._id, { quantity: e.target.value })}
                />
              </div>
              <button
                type="button"
                title="Удалить позицию"
                onClick={() => removeRow(row._id)}
                style={{ width: 40, height: 44, flex: 'none', borderRadius: 10, background: 'var(--color-fill-input)', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <Icon name="x" size={16} strokeWidth={2} />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addRow}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 10, background: 'none', border: 'none', color: 'var(--color-primary)', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', padding: 0 }}
        >
          <Icon name="plus" size={16} strokeWidth={2.4} />
          Добавить позицию
        </button>
      </div>

      <div style={{ marginTop: 18 }}>
        <Input
          label="Комментарий (необязательно)"
          multiline
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Например: вызывали мастера…, акт №…"
        />
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <Button variant="secondary" fullWidth onClick={onClose}>
          Отмена
        </Button>
        <Button fullWidth loading={submitting} disabled={!hasContent} onClick={submit}>
          Провести ТО
        </Button>
      </div>
    </Modal>
  )
}
