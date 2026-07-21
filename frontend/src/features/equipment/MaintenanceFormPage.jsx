import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Banner, BackButton, Button, Card, DatePicker, FormActions, Icon, Input, SearchInput, Select, Spinner } from '../../shared/ui'
import { getEquipment, getEquipmentRegulations, performMaintenance } from './equipmentApi.js'
import { regulationPeriodLabel } from '../types/TypesEditorPage.jsx'
import { planStatusIcon } from './statusLabels.js'
import './MaintenanceFormPage.css'

function todayISO() {
  const t = new Date()
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
}
function formatShortDate(iso) {
  return iso ? new Date(iso).toLocaleDateString('ru-RU') : '—'
}
// Дата + N месяцев (клампит день к длине месяца) — зеркало backend add_months.
function addMonths(iso, months) {
  const d = new Date(iso + 'T00:00:00')
  const day = d.getDate()
  d.setDate(1)
  d.setMonth(d.getMonth() + months)
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  d.setDate(Math.min(day, last))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

let nextRowId = 1

// B13+. Проведение ТО — отдельная страница: сначала выбор регламента (первый
// пункт «Внеплановое ТО»), затем позиции (строки из регламента — read-only, можно
// отменить с причиной; свои строки — редактируемые), комментарий и дата.
export function MaintenanceFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [equipment, setEquipment] = useState(null)
  const [regulations, setRegulations] = useState(null)
  const [loadError, setLoadError] = useState(false)

  // null — экран выбора; { unplanned:true } — внеплановое; иначе объект регламента.
  const [chosen, setChosen] = useState(null)
  const [query, setQuery] = useState('')

  const [items, setItems] = useState([])
  const [comment, setComment] = useState('')
  const [nextDate, setNextDate] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(() => {
    setLoadError(false)
    getEquipment(id)
      .then((data) => {
        setEquipment(data)
        return getEquipmentRegulations(id)
      })
      .then(setRegulations)
      .catch(() => setLoadError(true))
  }, [id])
  useEffect(load, [load])

  const choose = (reg) => {
    setError(null)
    if (reg === 'unplanned') {
      setChosen({ unplanned: true })
      setItems([])
      setNextDate('')
    } else {
      setChosen(reg)
      setItems(
        (reg.items || []).map((i) => ({
          _id: nextRowId++, kind: i.kind, name: i.name, quantity: String(i.quantity),
          from_regulation: true, cancelled: false, cancel_reason: '',
        })),
      )
      setNextDate(reg.on_demand ? '' : addMonths(todayISO(), reg.period_months))
    }
    setComment('')
  }

  const addRow = (kind) =>
    setItems((prev) => [...prev, { _id: nextRowId++, kind, name: '', quantity: '1', from_regulation: false, cancelled: false, cancel_reason: '' }])
  const removeRow = (rid) => setItems((prev) => prev.filter((r) => r._id !== rid))
  const patchRow = (rid, patch) => setItems((prev) => prev.map((r) => (r._id === rid ? { ...r, ...patch } : r)))

  const isPeriodic = chosen && !chosen.unplanned && !chosen.on_demand
  const maxDate = isPeriodic ? addMonths(todayISO(), chosen.period_months) : undefined

  const activeItems = items.filter((r) => !r.cancelled && r.name.trim())
  const cancelReasonMissing = items.some((r) => r.cancelled && !r.cancel_reason.trim())
  const dateOk = !isPeriodic || (nextDate && nextDate >= todayISO() && nextDate <= maxDate)
  const canSubmit = !!chosen && activeItems.length > 0 && !cancelReasonMissing && dateOk

  const submit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const payloadItems = items
        .filter((r) => r.name.trim())
        .map((r) => ({
          kind: r.kind,
          name: r.name.trim(),
          quantity: r.quantity === '' ? '0' : r.quantity,
          from_regulation: r.from_regulation,
          is_cancelled: r.cancelled,
          cancel_reason: r.cancelled ? r.cancel_reason.trim() : '',
        }))
      await performMaintenance(id, {
        regulation: chosen.unplanned ? null : chosen.id,
        nextDate: isPeriodic ? nextDate : undefined,
        comment: comment.trim() || undefined,
        items: payloadItems,
      })
      navigate(-1)
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
  if (!equipment || regulations === null) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
        <Spinner />
      </div>
    )
  }

  // Пикер: «Внеплановое ТО» + активные планы (не отменённые, не архивные) в
  // порядке с бэкенда (просрочено→подходит→запланировано→без даты→по потребности).
  const activeRegs = regulations.filter((r) => !r.is_archived && !r.plan?.is_cancelled)
  const q = query.trim().toLowerCase()
  const filteredRegs = q ? activeRegs.filter((r) => r.name.toLowerCase().includes(q)) : activeRegs

  const header = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
      <BackButton onClick={chosen ? () => setChosen(null) : undefined} />
      <div style={{ minWidth: 0 }}>
        <h1 className="ele-card-title">Провести ТО</h1>
        <div style={{ fontSize: 13.5, color: 'var(--color-text-placeholder)' }}>
          {equipment.type_and_model} · {equipment.inventory_number}
        </div>
      </div>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ width: '100%', maxWidth: 660 }}>
        {header}

        {!chosen ? (
          <Card>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Выберите, какое ТО провести</div>
            <div style={{ marginBottom: 12 }}>
              <SearchInput value={query} onChange={setQuery} placeholder="Поиск регламента" />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* Внеплановое ТО — всегда первым. */}
              <button type="button" onClick={() => choose('unplanned')} style={pickerRowStyle}>
                <span style={{ flex: 'none', color: 'var(--color-text-muted)' }}>
                  <Icon name="wrench" size={17} strokeWidth={2} />
                </span>
                <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>Внеплановое ТО</div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)' }}>Без плановой даты, вне регламента</div>
                </div>
                <Icon name="chevron-right" size={18} strokeWidth={2} style={{ color: 'var(--color-border-strong)' }} />
              </button>
              {filteredRegs.map((r) => {
                const ic = r.on_demand ? { icon: 'wrench', color: 'var(--color-text-muted)', title: 'По потребности' } : planStatusIcon(r.status)
                return (
                  <button key={r.id} type="button" onClick={() => choose(r)} style={pickerRowStyle}>
                    <span style={{ flex: 'none', color: ic.color }} title={ic.title}>
                      <Icon name={ic.icon} size={17} strokeWidth={2} />
                    </span>
                    <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                      <div className="ele-clamp-2" style={{ fontSize: 14, fontWeight: 600 }}>{r.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)' }}>
                        {regulationPeriodLabel(r)}
                        {!r.on_demand ? ` · ${r.plan?.next_planned_date ? `план: ${formatShortDate(r.plan.next_planned_date)}` : 'дата не задана'}` : ''}
                      </div>
                    </div>
                    <Icon name="chevron-right" size={18} strokeWidth={2} style={{ color: 'var(--color-border-strong)' }} />
                  </button>
                )
              })}
            </div>
          </Card>
        ) : (
          <>
            <Card>
              {error ? <Banner variant="error">{error}</Banner> : null}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 18 }}>
                <span style={{ fontSize: 13, color: 'var(--color-text-placeholder)', flex: 'none', marginTop: 1 }}>Регламент:</span>
                <span className="ele-clamp-2" style={{ fontSize: 14, fontWeight: 600, flex: 1, minWidth: 0 }}>{chosen.unplanned ? 'Внеплановое ТО' : chosen.name}</span>
                <button type="button" onClick={() => setChosen(null)} style={{ flex: 'none', background: 'none', border: 'none', color: 'var(--color-primary)', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  Изменить
                </button>
              </div>

              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Работы и материалы</div>
              {items.length === 0 ? (
                <div style={{ fontSize: 13.5, color: 'var(--color-text-muted)', marginBottom: 12 }}>Позиции не добавлены.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
                  {items.map((row) =>
                    row.from_regulation ? (
                      // Строка из регламента — read-only, можно только отменить (с причиной).
                      <div key={row._id} style={{ opacity: row.cancelled ? 0.7 : 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: 'var(--color-fill-input)', borderRadius: 10 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13.5, fontWeight: 600, textDecoration: row.cancelled ? 'line-through' : 'none' }}>
                              {row.kind === 'material' ? 'Материал' : 'Работа'}: {row.name}
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)' }}>Количество: {row.quantity}</div>
                          </div>
                          <button
                            type="button"
                            title={row.cancelled ? 'Вернуть строку' : 'Отменить строку'}
                            onClick={() => patchRow(row._id, { cancelled: !row.cancelled, cancel_reason: row.cancelled ? '' : row.cancel_reason })}
                            style={{ ...rowIconBtn, color: row.cancelled ? 'var(--color-primary)' : 'var(--color-error)' }}
                          >
                            <Icon name={row.cancelled ? 'undo-2' : 'ban'} size={16} strokeWidth={2} />
                          </button>
                        </div>
                        {row.cancelled ? (
                          <div style={{ marginTop: 6 }}>
                            <Input
                              placeholder="Причина отмены (обязательно)"
                              value={row.cancel_reason}
                              onChange={(e) => patchRow(row._id, { cancel_reason: e.target.value })}
                            />
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      // Своя строка — полностью редактируемая, можно удалить. На
                      // мобильных раскладывается построчно (см. .ele-maint-row в CSS).
                      <div key={row._id} className="ele-maint-row">
                        <Select className="ele-maint-row__kind" value={row.kind} onChange={(v) => patchRow(row._id, { kind: v })}>
                          <option value="work">Работа</option>
                          <option value="material">Материал</option>
                        </Select>
                        <Input className="ele-maint-row__name" placeholder="Наименование" value={row.name} onChange={(e) => patchRow(row._id, { name: e.target.value })} />
                        <Input className="ele-maint-row__qty" type="number" min="0" step="any" placeholder="Кол-во" value={row.quantity} onChange={(e) => patchRow(row._id, { quantity: e.target.value })} />
                        <button type="button" className="ele-maint-row__del" title="Удалить строку" onClick={() => removeRow(row._id)}>
                          <Icon name="trash-2" size={16} strokeWidth={2} />
                        </button>
                      </div>
                    ),
                  )}
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

              <div style={{ marginTop: 24 }}>
                <Input
                  label="Комментарий (необязательно)"
                  multiline
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Например: вызывали мастера…, акт №…"
                />
              </div>

              {isPeriodic ? (
                <div style={{ maxWidth: 320, marginTop: 24 }}>
                  <DatePicker label="Дата следующего ТО" value={nextDate} onChange={setNextDate} minDate={todayISO()} maxDate={maxDate} />
                  <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)', marginTop: 6 }}>
                    Не позже расчётной даты {formatShortDate(maxDate)} (сегодня + {regulationPeriodLabel(chosen).toLowerCase().replace('раз в ', '')}).
                  </div>
                </div>
              ) : null}
            </Card>

            <FormActions
              onCancel={() => navigate(-1)}
              onSubmit={submit}
              submitting={submitting}
              submitLabel="Провести ТО"
              submitDisabled={!canSubmit}
            />
          </>
        )}
      </div>
    </div>
  )
}

const pickerRowStyle = {
  display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '11px 13px',
  background: 'var(--color-fill-input)', border: 'none', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
}
const rowIconBtn = {
  width: 32, height: 32, flex: 'none', borderRadius: 8, background: 'var(--color-surface)', border: 'none',
  color: 'var(--color-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
}
