import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Banner, BackButton, Button, Card, DatePicker, Icon, Input, Select, Spinner } from '../../shared/ui'
import { getEquipment, performMaintenance } from './equipmentApi.js'
import { MAINTENANCE_STATUS_COLOR, MAINTENANCE_STATUS_ICONS, MAINTENANCE_STATUS_LABEL } from './statusLabels.js'
import './MaintenanceFormPage.css'

function todayISO() {
  const t = new Date()
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
}
function formatShortDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('ru-RU')
}

let nextRowId = 1

// B13. Проведение ТО — отдельная страница (не модалка): дата следующего ТО,
// таблица позиций (Работа/Материал) и комментарий.
export function MaintenanceFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [equipment, setEquipment] = useState(null)
  const [loadError, setLoadError] = useState(false)

  const [nextDate, setNextDate] = useState('')
  const [comment, setComment] = useState('')
  // По умолчанию позиций нет — пользователь добавляет их сам.
  const [items, setItems] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(() => {
    setLoadError(false)
    getEquipment(id)
      .then(setEquipment)
      .catch(() => setLoadError(true))
  }, [id])
  useEffect(load, [load])

  const addRow = (kind) => setItems((prev) => [...prev, { _id: nextRowId++, kind, name: '', quantity: '1' }])
  const removeRow = (rid) => setItems((prev) => prev.filter((r) => r._id !== rid))
  const patchRow = (rid, patch) => setItems((prev) => prev.map((r) => (r._id === rid ? { ...r, ...patch } : r)))

  const filledItems = items.filter((r) => r.name.trim())
  const hasContent = Boolean(nextDate) || Boolean(comment.trim()) || filledItems.length > 0

  const submit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      await performMaintenance(id, {
        nextDate: nextDate || undefined,
        comment: comment.trim() || undefined,
        items: filledItems.map((r) => ({
          kind: r.kind,
          name: r.name.trim(),
          quantity: r.quantity === '' ? '0' : r.quantity,
        })),
      })
      navigate(`/equipment/${id}`)
    } catch (err) {
      setError(err.errors ? Object.values(err.errors).flat().join(' ') : err.detail || 'Не удалось сохранить ТО.')
      setSubmitting(false)
    }
  }

  if (loadError) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 60, textAlign: 'center' }}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>Не удалось открыть оборудование</div>
        <Button variant="secondary" onClick={() => navigate('/')}>К списку оборудования</Button>
      </div>
    )
  }
  if (!equipment) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
        <Spinner />
      </div>
    )
  }

  const status = equipment.maintenance_status
  const statusIcons = MAINTENANCE_STATUS_ICONS[status]

  return (
    <div className="ele-maint-page">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <BackButton />
        <div style={{ minWidth: 0 }}>
          <h1 className="ele-card-title">Провести ТО</h1>
          <div style={{ fontSize: 13.5, color: 'var(--color-text-placeholder)' }}>
            {equipment.type_and_model} · {equipment.inventory_number}
          </div>
        </div>
      </div>

      <Card>
        {error ? <Banner variant="error">{error}</Banner> : null}

        {/* Текущий статус ТО */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: MAINTENANCE_STATUS_COLOR[status] || 'var(--color-text-muted)' }}>
            {(statusIcons?.icons || ['wrench']).map((name) => (
              <Icon key={name} name={name} size={18} strokeWidth={2} />
            ))}
          </span>
          <div>
            <span style={{ fontSize: 13, color: 'var(--color-text-placeholder)' }}>Текущий статус: </span>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: MAINTENANCE_STATUS_COLOR[status] }}>
              {MAINTENANCE_STATUS_LABEL[status] || 'ТО не запланировано'}
            </span>
            {equipment.next_maintenance_date && status !== 'not_planned' ? (
              <span style={{ fontSize: 13, color: 'var(--color-text-placeholder)' }}>
                {' '}· плановая дата {formatShortDate(equipment.next_maintenance_date)}
              </span>
            ) : null}
          </div>
        </div>

        <div style={{ maxWidth: 320, marginBottom: 24 }}>
          <DatePicker
            label="Дата следующего ТО"
            value={nextDate}
            onChange={setNextDate}
            minDate={todayISO()}
          />
        </div>

        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Работы и материалы</div>
        {items.length === 0 ? (
          <div style={{ fontSize: 13.5, color: 'var(--color-text-muted)', marginBottom: 12 }}>
            Позиции не добавлены.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
            {items.map((row) => (
              <div key={row._id} className="ele-maint-row">
                <div className="ele-maint-row__kind">
                  <Select value={row.kind} onChange={(v) => patchRow(row._id, { kind: v })}>
                    <option value="work">Работа</option>
                    <option value="material">Материал</option>
                  </Select>
                </div>
                <div className="ele-maint-row__name">
                  <Input placeholder="Наименование" value={row.name} onChange={(e) => patchRow(row._id, { name: e.target.value })} />
                </div>
                <div className="ele-maint-row__qty">
                  <Input type="number" min="0" step="any" placeholder="Кол-во" value={row.quantity} onChange={(e) => patchRow(row._id, { quantity: e.target.value })} />
                </div>
                <button type="button" title="Удалить позицию" className="ele-maint-row__del" onClick={() => removeRow(row._id)}>
                  <Icon name="x" size={17} strokeWidth={2} />
                </button>
              </div>
            ))}
          </div>
        )}
        {/* Кликабельный текст: добавляет строку с предзаполненным «Работа» и
            количеством 1 — тип/количество пользователь меняет в самой строке. */}
        <button
          type="button"
          onClick={() => addRow('work')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: 'var(--color-primary)', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', padding: 0 }}
        >
          <Icon name="plus" size={16} strokeWidth={2.4} />
          Добавить работу/материал
        </button>

        <div style={{ marginTop: 24 }}>
          <Input
            label="Комментарий (необязательно)"
            multiline
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Например: вызывали мастера…, акт №…"
          />
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
          <Button variant="secondary" onClick={() => navigate(`/equipment/${id}`)}>
            Отмена
          </Button>
          <Button loading={submitting} disabled={!hasContent} onClick={submit}>
            Провести ТО
          </Button>
        </div>
      </Card>
    </div>
  )
}
