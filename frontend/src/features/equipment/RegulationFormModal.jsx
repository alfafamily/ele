import { useState } from 'react'
import { Banner, Button, Checkbox, Icon, Input, Modal, Select } from '../../shared/ui'

let nextRowId = 1

// B13+. Создание/редактирование регламента ТО — общая модалка для регламентов
// типа (редактор Типов) и индивидуальных (карточка оборудования). Поля:
// наименование, периодичность (в месяцах либо «по потребности») и перечень
// работ/материалов (вид + наименование + количество).
export function RegulationFormModal({ regulation, onClose, onSave, title }) {
  const editing = !!regulation
  const [name, setName] = useState(regulation?.name || '')
  const [onDemand, setOnDemand] = useState(!!regulation?.on_demand)
  const [periodMonths, setPeriodMonths] = useState(
    regulation?.period_months != null ? String(regulation.period_months) : '',
  )
  const [items, setItems] = useState(() =>
    (regulation?.items || []).map((i) => ({ _id: nextRowId++, kind: i.kind, name: i.name, quantity: String(i.quantity) })),
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const addRow = (kind) => setItems((prev) => [...prev, { _id: nextRowId++, kind, name: '', quantity: '1' }])
  const removeRow = (rid) => setItems((prev) => prev.filter((r) => r._id !== rid))
  const patchRow = (rid, patch) => setItems((prev) => prev.map((r) => (r._id === rid ? { ...r, ...patch } : r)))

  const filledItems = items.filter((r) => r.name.trim())
  const canSubmit =
    name.trim() && filledItems.length > 0 && (onDemand || Number(periodMonths) >= 1)

  const submit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      await onSave({
        name: name.trim(),
        on_demand: onDemand,
        period_months: onDemand ? null : Number(periodMonths),
        items: filledItems.map((r) => ({
          kind: r.kind,
          name: r.name.trim(),
          quantity: r.quantity === '' ? '0' : r.quantity,
        })),
      })
    } catch (err) {
      setError(err.errors ? Object.values(err.errors).flat().join(' ') : err.detail || 'Не удалось сохранить регламент.')
      setSubmitting(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={title || (editing ? 'Редактирование регламента' : 'Новый регламент')}>
      {error ? <Banner variant="error">{error}</Banner> : null}
      <Input label="Наименование" required autoFocus value={name} onChange={(e) => setName(e.target.value)} />

      <div style={{ marginTop: 14 }}>
        <Checkbox
          label="Периодичность «по потребности» (без плановой даты)"
          checked={onDemand}
          onChange={setOnDemand}
        />
      </div>
      {!onDemand ? (
        <div style={{ maxWidth: 220, marginTop: 12 }}>
          <Input
            label="Периодичность, месяцев"
            type="number"
            min="1"
            step="1"
            value={periodMonths}
            onChange={(e) => setPeriodMonths(e.target.value)}
          />
        </div>
      ) : null}

      <div style={{ fontSize: 14, fontWeight: 600, margin: '20px 0 10px' }}>Работы и материалы</div>
      {items.length === 0 ? (
        <div style={{ fontSize: 13.5, color: 'var(--color-text-muted)', marginBottom: 12 }}>Позиции не добавлены.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
          {items.map((row) => (
            <div key={row._id} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 90px 32px', gap: 8, alignItems: 'center' }}>
              <Select value={row.kind} onChange={(v) => patchRow(row._id, { kind: v })}>
                <option value="work">Работа</option>
                <option value="material">Материал</option>
              </Select>
              <Input placeholder="Наименование" value={row.name} onChange={(e) => patchRow(row._id, { name: e.target.value })} />
              <Input type="number" min="0" step="any" placeholder="Кол-во" value={row.quantity} onChange={(e) => patchRow(row._id, { quantity: e.target.value })} />
              <button
                type="button"
                title="Удалить позицию"
                onClick={() => removeRow(row._id)}
                style={{ width: 32, height: 32, flex: 'none', borderRadius: 8, background: 'var(--color-fill-input)', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <Icon name="trash-2" size={16} strokeWidth={2} />
              </button>
            </div>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => addRow('work')}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: 'var(--color-primary)', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', padding: 0 }}
      >
        <Icon name="plus" size={16} strokeWidth={2.4} />
        Добавить работу/материал
      </button>

      <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
        <Button variant="secondary" fullWidth onClick={onClose}>
          Отмена
        </Button>
        <Button fullWidth loading={submitting} disabled={!canSubmit} onClick={submit}>
          {editing ? 'Сохранить' : 'Создать'}
        </Button>
      </div>
    </Modal>
  )
}
