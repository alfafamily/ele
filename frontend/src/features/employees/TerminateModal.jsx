import { useEffect, useState } from 'react'
import { apiGet } from '../../shared/api/client'
import { Banner, Button, Checkbox, Input, Modal, Select } from '../../shared/ui'
import { terminateEmployee } from './employeesApi.js'

// Отображаемое имя средства доступа в списке увольнения.
function passLabel(pass) {
  if (pass.object_type === 'key') {
    const b = (pass.buildings || [])[0]
    const r = (pass.rooms || [])[0]
    const target = b ? (r ? `${r.name} (${b.name})` : b.name) : '—'
    return `Ключ · ${target}`
  }
  return `Пропуск · ${pass.name || (pass.account_number ? `№ ${pass.account_number}` : 'без названия')}`
}

// Выбор склада назначения (B26) — обязателен для перемещаемых на хранение
// объектов (не требуется для E-SIM и при утилизации/передаче).
function StorageSelect({ places, value, onChange, error, label = 'Куда переместить' }) {
  return (
    <div style={{ marginTop: 8 }}>
      <Select label={label} required placeholder="Выберите склад" value={value} onChange={onChange} error={error}>
        {places.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} · {p.building_name} — {p.room_name}
          </option>
        ))}
      </Select>
    </div>
  )
}

// Строка выбора действия для одного объекта при увольнении. Для оборудования и
// инструментов — только склад назначения (options не передаётся); для SIM и
// пропусков/ключей — действие (открепить / утилизировать / …) + при откреплении
// склад назначения, при утилизации — комментарий.
function DispositionRow({ label, sub, options, value, comment, storage, storageError, storagePlaces, showStorage, onChange, onComment, onStorage }) {
  const isUtilize = options && value !== 'detach'
  return (
    <div style={{ padding: '10px 0', borderTop: '1px solid var(--color-border-hairline)' }}>
      <div style={{ fontSize: 13.5, fontWeight: 600, overflowWrap: 'anywhere' }}>{label}</div>
      {sub ? <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)', marginTop: 1, marginBottom: 8, fontFamily: 'var(--font-mono)' }}>{sub}</div> : <div style={{ marginBottom: 8 }} />}
      {options ? (
        <Select value={value} onChange={onChange}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </Select>
      ) : null}
      {showStorage ? (
        <StorageSelect places={storagePlaces} value={storage} onChange={onStorage} error={storageError} />
      ) : null}
      {isUtilize ? (
        <div style={{ marginTop: 8 }}>
          <Input multiline rows={2} value={comment} onChange={(e) => onComment(e.target.value)} placeholder="Комментарий (необязательно)" />
        </div>
      ) : null}
    </div>
  )
}

function SectionTitle({ children }) {
  return <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>{children}</div>
}

// E3 — увольнение: для каждого закреплённого объекта (оборудование, инструменты,
// SIM/E-SIM, пропуска/ключи) предлагает склад назначения (куда переместить), а
// для SIM и пропусков — ещё и утилизацию/передачу арендодателю. От рабочих мест
// сотрудник просто открепляется. При наличии учётной записи — деактивация.
export function TerminateModal({ employee, onClose, onDone }) {
  const [deactivateUser, setDeactivateUser] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [triedSubmit, setTriedSubmit] = useState(false)
  const [storagePlaces, setStoragePlaces] = useState([])

  const equipment = employee.equipment ?? []
  const tools = employee.tools ?? []
  const workplaces = employee.workplaces ?? []
  const activeSims = (employee.sim_cards ?? []).filter((s) => !s.is_deactivated && !s.is_utilized)
  const activePasses = (employee.passes ?? []).filter((p) => !p.is_deactivated && !p.is_utilized)

  useEffect(() => {
    apiGet('/api/places/?place_type=storage&active=1')
      .then((data) => setStoragePlaces(Array.isArray(data) ? data : data.results || []))
      .catch(() => setStoragePlaces([]))
  }, [])

  // Состояние выбора по объектам.
  const [equipmentState, setEquipmentState] = useState(() =>
    Object.fromEntries(equipment.map((e) => [e.id, { storage: '' }])),
  )
  const [toolState, setToolState] = useState(() =>
    Object.fromEntries(tools.map((t) => [t.id, { storage: '' }])),
  )
  const [simState, setSimState] = useState(() =>
    Object.fromEntries(activeSims.map((s) => [s.id, { action: 'detach', comment: '', storage: '' }])),
  )
  const [passState, setPassState] = useState(() =>
    Object.fromEntries(activePasses.map((p) => [p.id, { action: 'detach', comment: '', storage: '' }])),
  )

  const SIM_OPTIONS = [
    { value: 'detach', label: 'Открепить (станет неиспользуемой)' },
    { value: 'utilized', label: 'Утилизировать' },
  ]
  const PASS_OPTIONS = [
    { value: 'detach', label: 'Открепить (станет неиспользуемым)' },
    { value: 'utilized', label: 'Утилизировать' },
    { value: 'handed', label: 'Передать арендодателю' },
  ]

  // Склад обязателен для перемещаемых на хранение объектов: всё оборудование и
  // инструменты; SIM (кроме E-SIM) и пропуска/ключи — только при откреплении.
  const needsStorage = { equipment: [], tool: [], sim: [], pass: [] }
  equipment.forEach((e) => { if (!equipmentState[e.id].storage) needsStorage.equipment.push(e.id) })
  tools.forEach((t) => { if (!toolState[t.id].storage) needsStorage.tool.push(t.id) })
  activeSims.forEach((s) => {
    const st = simState[s.id]
    if (st.action === 'detach' && s.sim_type !== 'esim' && !st.storage) needsStorage.sim.push(s.id)
  })
  activePasses.forEach((p) => {
    const st = passState[p.id]
    if (st.action === 'detach' && !st.storage) needsStorage.pass.push(p.id)
  })
  const missingStorage = needsStorage.equipment.length + needsStorage.tool.length + needsStorage.sim.length + needsStorage.pass.length

  const submit = async () => {
    if (missingStorage > 0) {
      setTriedSubmit(true)
      setError('Укажите склад назначения для всех перемещаемых объектов.')
      return
    }
    setSubmitting(true)
    setError(null)
    // Собираем действия: склад назначения передаём только там, где он выбран.
    const equipmentActions = Object.fromEntries(
      Object.entries(equipmentState).map(([id, s]) => [id, { storage_place: s.storage ? Number(s.storage) : null }]),
    )
    const toolActions = Object.fromEntries(
      Object.entries(toolState).map(([id, s]) => [id, { storage_place: s.storage ? Number(s.storage) : null }]),
    )
    const simActions = Object.fromEntries(
      Object.entries(simState).map(([id, s]) => [id, { action: s.action, comment: s.comment, storage_place: s.storage ? Number(s.storage) : null }]),
    )
    const passActions = Object.fromEntries(
      Object.entries(passState).map(([id, s]) => [id, { action: s.action, comment: s.comment, storage_place: s.storage ? Number(s.storage) : null }]),
    )
    try {
      const updated = await terminateEmployee(employee.id, {
        deactivateUser,
        equipmentActions,
        toolActions,
        simActions,
        passActions,
      })
      onDone(updated)
    } catch (err) {
      setError(err.detail || 'Не удалось уволить сотрудника.')
    } finally {
      setSubmitting(false)
    }
  }

  const nothingAssigned =
    equipment.length === 0 && tools.length === 0 && activeSims.length === 0 && activePasses.length === 0 && workplaces.length === 0

  return (
    <Modal open onClose={onClose} title="Уволить сотрудника?">
      {error ? <Banner variant="error">{error}</Banner> : null}
      <p style={{ fontSize: 14, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
        Сотрудник <b style={{ color: 'var(--color-text-primary)' }}>{employee.full_name}</b> будет переведён в статус «Уволен».{' '}
        {nothingAssigned ? 'Закреплённого имущества нет.' : 'Укажите, куда переместить закреплённое имущество.'}
      </p>

      {equipment.length > 0 ? (
        <div style={{ margin: '14px 0' }}>
          <SectionTitle>Оборудование</SectionTitle>
          {equipment.map((e) => (
            <DispositionRow
              key={e.id}
              label={e.type_and_model}
              sub={e.inventory_number}
              storage={equipmentState[e.id].storage}
              storageError={triedSubmit && !equipmentState[e.id].storage ? 'Укажите склад' : undefined}
              storagePlaces={storagePlaces}
              showStorage
              onStorage={(storage) => setEquipmentState((prev) => ({ ...prev, [e.id]: { storage } }))}
            />
          ))}
        </div>
      ) : null}

      {tools.length > 0 ? (
        <div style={{ margin: '14px 0' }}>
          <SectionTitle>Инструменты</SectionTitle>
          {tools.map((t) => (
            <DispositionRow
              key={t.id}
              label={`${t.name} · ${t.quantity} шт.`}
              storage={toolState[t.id].storage}
              storageError={triedSubmit && !toolState[t.id].storage ? 'Укажите склад' : undefined}
              storagePlaces={storagePlaces}
              showStorage
              onStorage={(storage) => setToolState((prev) => ({ ...prev, [t.id]: { storage } }))}
            />
          ))}
        </div>
      ) : null}

      {activeSims.length > 0 ? (
        <div style={{ margin: '14px 0' }}>
          <SectionTitle>Корпоративная связь</SectionTitle>
          {activeSims.map((s) => (
            <DispositionRow
              key={s.id}
              label={`${s.sim_type_display} · ${s.phone_number}`}
              options={SIM_OPTIONS}
              value={simState[s.id].action}
              comment={simState[s.id].comment}
              storage={simState[s.id].storage}
              storageError={triedSubmit && !simState[s.id].storage ? 'Укажите склад' : undefined}
              storagePlaces={storagePlaces}
              showStorage={simState[s.id].action === 'detach' && s.sim_type !== 'esim'}
              onChange={(action) => setSimState((prev) => ({ ...prev, [s.id]: { ...prev[s.id], action } }))}
              onComment={(comment) => setSimState((prev) => ({ ...prev, [s.id]: { ...prev[s.id], comment } }))}
              onStorage={(storage) => setSimState((prev) => ({ ...prev, [s.id]: { ...prev[s.id], storage } }))}
            />
          ))}
        </div>
      ) : null}

      {activePasses.length > 0 ? (
        <div style={{ margin: '14px 0' }}>
          <SectionTitle>Средства доступа</SectionTitle>
          {activePasses.map((p) => (
            <DispositionRow
              key={p.id}
              label={passLabel(p)}
              options={PASS_OPTIONS}
              value={passState[p.id].action}
              comment={passState[p.id].comment}
              storage={passState[p.id].storage}
              storageError={triedSubmit && !passState[p.id].storage ? 'Укажите склад' : undefined}
              storagePlaces={storagePlaces}
              showStorage={passState[p.id].action === 'detach'}
              onChange={(action) => setPassState((prev) => ({ ...prev, [p.id]: { ...prev[p.id], action } }))}
              onComment={(comment) => setPassState((prev) => ({ ...prev, [p.id]: { ...prev[p.id], comment } }))}
              onStorage={(storage) => setPassState((prev) => ({ ...prev, [p.id]: { ...prev[p.id], storage } }))}
            />
          ))}
        </div>
      ) : null}

      {workplaces.length > 0 ? (
        <div style={{ margin: '14px 0' }}>
          <Banner variant="info">
            Сотрудник будет откреплён от {workplaces.length}{' '}
            {workplaces.length === 1 ? 'рабочего места' : 'рабочих мест'}. Стоящее на них имущество остаётся на местах.
          </Banner>
        </div>
      ) : null}

      {employee.user_email ? (
        <>
          <Banner variant="warning">
            Сотрудник связан с учётной записью <b>{employee.user_email}</b>.
          </Banner>
          <div style={{ margin: '16px 0' }}>
            <Checkbox label="Также деактивировать связанную учётную запись" checked={deactivateUser} onChange={setDeactivateUser} />
          </div>
        </>
      ) : (
        <div style={{ height: 16 }} />
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Button variant="danger-solid" fullWidth loading={submitting} onClick={submit}>
          Уволить
        </Button>
        <Button variant="secondary" fullWidth onClick={onClose}>
          Отмена
        </Button>
      </div>
    </Modal>
  )
}
