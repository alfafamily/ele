import { useState } from 'react'
import { Banner, Button, Icon, InlineCalendar, Input, Modal, Select } from '../../shared/ui'
// Раскладка строки «работа/материал» (desktop — в ряд, мобилка — построчно).
import './MaintenanceFormPage.css'

let nextRowId = 1

function todayISO() {
  const t = new Date()
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
}

// B13+. Создание/редактирование регламента ТО — общая модалка для регламентов
// типа (редактор Типов) и индивидуальных (карточка оборудования). Поля:
// наименование, периодичность (в месяцах либо «по потребности») и перечень
// работ/материалов (вид + наименование + количество). showFirstDate — показать
// поле «Дата первого ТО» (при создании индивидуального регламента).
export function RegulationFormModal({ regulation, onClose, onSave, title, showFirstDate = false }) {
  const editing = !!regulation
  const [name, setName] = useState(regulation?.name || '')
  const [onDemand, setOnDemand] = useState(!!regulation?.on_demand)
  const [periodMonths, setPeriodMonths] = useState(
    regulation?.period_months != null ? String(regulation.period_months) : '',
  )
  const [firstDate, setFirstDate] = useState('')
  const [items, setItems] = useState(() =>
    (regulation?.items || []).map((i) => ({ _id: nextRowId++, kind: i.kind, name: i.name, quantity: String(i.quantity) })),
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const addRow = (kind) => setItems((prev) => [...prev, { _id: nextRowId++, kind, name: '', quantity: '1' }])
  const removeRow = (rid) => setItems((prev) => prev.filter((r) => r._id !== rid))
  const patchRow = (rid, patch) => setItems((prev) => prev.map((r) => (r._id === rid ? { ...r, ...patch } : r)))

  const filledItems = items.filter((r) => r.name.trim())
  // Дата первого ТО обязательна при создании индивидуального периодического
  // регламента (для «по потребности» даты нет).
  const firstDateOk = !showFirstDate || onDemand || Boolean(firstDate)
  const canSubmit =
    name.trim() && filledItems.length > 0 && (onDemand || Number(periodMonths) >= 1) && firstDateOk

  const submit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      await onSave({
        name: name.trim(),
        on_demand: onDemand,
        period_months: onDemand ? null : Number(periodMonths),
        // Дата первого ТО — только при создании индивидуального периодического
        // регламента (бэкенд задаёт план после создания).
        ...(showFirstDate && !onDemand && firstDate ? { next_planned_date: firstDate } : {}),
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

      <div style={{ marginTop: 18 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Периодичность</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
          <PeriodOption label="Периодический" active={!onDemand} onClick={() => setOnDemand(false)} />
          <PeriodOption
            label="По потребности"
            active={onDemand}
            onClick={() => {
              setOnDemand(true)
              setPeriodMonths('') // очищаем период при переключении
            }}
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
      </div>

      {showFirstDate && !onDemand ? (
        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
            Дата первого ТО <span style={{ color: 'var(--color-error)' }}>*</span>
          </div>
          <InlineCalendar value={firstDate} onChange={setFirstDate} minDate={todayISO()} />
        </div>
      ) : null}

      <div style={{ fontSize: 14, fontWeight: 600, margin: '20px 0 10px' }}>Работы и материалы</div>
      {items.length === 0 ? (
        <div style={{ fontSize: 13.5, color: 'var(--color-text-muted)', marginBottom: 12 }}>Позиции не добавлены.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
          {items.map((row) => (
            // Desktop — в ряд, мобилка — построчно (тип / наименование / кол-во+удаление).
            <div key={row._id} className="ele-maint-row">
              <Select className="ele-maint-row__kind" value={row.kind} onChange={(v) => patchRow(row._id, { kind: v })}>
                <option value="work">Работа</option>
                <option value="material">Материал</option>
              </Select>
              <Input className="ele-maint-row__name" placeholder="Наименование" value={row.name} onChange={(e) => patchRow(row._id, { name: e.target.value })} />
              <Input className="ele-maint-row__qty" type="number" min="0" step="any" placeholder="Кол-во" value={row.quantity} onChange={(e) => patchRow(row._id, { quantity: e.target.value })} />
              <button type="button" className="ele-maint-row__del" title="Удалить позицию" onClick={() => removeRow(row._id)}>
                <Icon name="x" size={18} strokeWidth={2} />
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

// Взаимоисключающий выбор периодичности (радио в виде плитки-чекбокса).
function PeriodOption({ label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '11px 13px', borderRadius: 10,
        background: active ? 'var(--color-fill-active-tint)' : 'var(--color-fill-input)',
        border: 'none', boxShadow: active ? 'inset 0 0 0 1.5px var(--color-primary)' : 'none',
        cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
      }}
    >
      <span
        style={{
          width: 18, height: 18, flex: 'none', borderRadius: '50%',
          border: active ? '5px solid var(--color-primary)' : '2px solid var(--color-border-strong)',
          boxSizing: 'border-box', background: 'var(--color-surface)',
        }}
      />
      <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)' }}>{label}</span>
    </button>
  )
}
