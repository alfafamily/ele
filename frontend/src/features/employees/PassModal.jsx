import { useEffect, useState } from 'react'
import { Badge, Banner, Button, Icon, Input, Modal, Spinner } from '../../shared/ui'
import { getBuildings } from '../premises/premisesApi.js'
import { createPass, updatePass } from './employeesApi.js'

// Добавление/редактирование пропуска СКУД. Один пропуск может действовать в
// нескольких зданиях: отмечаем здания чекбоксами, под каждым отмеченным —
// с отступом (иерархия) — список его помещений. Если у отмеченного здания не
// выбрано ни одного помещения, пропуск действует на все его помещения.
export function PassModal({ employeeId, pass, onClose, onDone }) {
  const isEdit = Boolean(pass)
  const [buildings, setBuildings] = useState(null)
  const [name, setName] = useState(pass?.name || '')
  const [accountNumber, setAccountNumber] = useState(pass?.account_number || '')
  const [typeVehicle, setTypeVehicle] = useState(pass?.type_vehicle || false)
  const [typePedestrian, setTypePedestrian] = useState(pass?.type_pedestrian || false)
  const [selBuildings, setSelBuildings] = useState(() => new Set((pass?.buildings || []).map((b) => b.id)))
  const [selRooms, setSelRooms] = useState(() => new Set((pass?.rooms || []).map((r) => r.id)))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})

  useEffect(() => {
    getBuildings().then(setBuildings)
  }, [])

  const activeRoomsOf = (b) => (b.rooms || []).filter((r) => !r.is_archived)

  const toggleBuilding = (b, checked) => {
    setSelBuildings((prev) => {
      const next = new Set(prev)
      if (checked) next.add(b.id)
      else next.delete(b.id)
      return next
    })
    if (!checked) {
      // Снимаем выбор помещений этого здания.
      const roomIds = new Set(activeRoomsOf(b).map((r) => r.id))
      setSelRooms((prev) => new Set([...prev].filter((id) => !roomIds.has(id))))
    }
  }

  const toggleRoom = (id, checked) => {
    setSelRooms((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const submit = async () => {
    setSubmitting(true)
    setError(null)
    setFieldErrors({})
    const payload = {
      name,
      account_number: accountNumber,
      type_vehicle: typeVehicle,
      type_pedestrian: typePedestrian,
      building_ids: [...selBuildings],
      room_ids: [...selRooms],
    }
    // Из карточки сотрудника создаём сразу привязанным; из раздела — свободным.
    if (!isEdit && employeeId) payload.employee = employeeId
    try {
      const saved = isEdit ? await updatePass(pass.id, payload) : await createPass(payload)
      onDone(saved)
    } catch (err) {
      if (err.errors) {
        setFieldErrors(err.errors)
      } else {
        setError(err.detail || 'Не удалось сохранить пропуск.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={isEdit ? 'Редактирование пропуска' : 'Новый пропуск'}>
      {error ? <Banner variant="error">{error}</Banner> : null}
      {buildings === null ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}>
          <Spinner />
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, margin: '4px 0 20px' }}>
            <Input
              label="Название"
              value={name}
              onChange={(e) => setName(e.target.value)}
              error={fieldErrors.name}
            />
            <Input
              label="Учётный номер"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              error={fieldErrors.account_number}
            />

            <div>
              <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)', marginBottom: 8 }}>Тип пропуска</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <CheckRow checked={typeVehicle} onChange={setTypeVehicle}>
                    <span style={{ fontSize: 14, fontWeight: 500 }}>Авто</span>
                  </CheckRow>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <CheckRow checked={typePedestrian} onChange={setTypePedestrian}>
                    <span style={{ fontSize: 14, fontWeight: 500 }}>Пеший</span>
                  </CheckRow>
                </div>
              </div>
            </div>

            <div>
              <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)', marginBottom: 8 }}>Здания и помещения</div>
              {buildings.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Зданий пока нет.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 340, overflowY: 'auto' }}>
                  {buildings.map((b) => {
                    const checked = selBuildings.has(b.id)
                    const rooms = activeRoomsOf(b)
                    return (
                      <div key={b.id}>
                        <CheckRow checked={checked} onChange={(v) => toggleBuilding(b, v)}>
                          <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.name}</span>
                        </CheckRow>
                        {checked ? (
                          <div style={{ marginLeft: 15, marginTop: 6, paddingLeft: 14, borderLeft: '2px solid var(--color-border-strong)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {rooms.length === 0 ? (
                              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>В здании нет помещений — пропуск действует на всё здание.</div>
                            ) : (
                              <>
                                {rooms.map((r) => (
                                  <CheckRow key={r.id} small checked={selRooms.has(r.id)} onChange={(v) => toggleRoom(r.id, v)}>
                                    {r.floor ? <Badge>эт. {r.floor}</Badge> : null}
                                    <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                                  </CheckRow>
                                ))}
                              </>
                            )}
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              )}
              {fieldErrors.building_ids ? (
                <div style={{ fontSize: 12, color: 'var(--color-error)', marginTop: 6 }}>
                  {Array.isArray(fieldErrors.building_ids) ? fieldErrors.building_ids[0] : fieldErrors.building_ids}
                </div>
              ) : null}
              {fieldErrors.room_ids ? (
                <div style={{ fontSize: 12, color: 'var(--color-error)', marginTop: 4 }}>
                  {Array.isArray(fieldErrors.room_ids) ? fieldErrors.room_ids[0] : fieldErrors.room_ids}
                </div>
              ) : null}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Button fullWidth loading={submitting} disabled={selBuildings.size === 0} onClick={submit}>
              Сохранить
            </Button>
            <Button variant="secondary" fullWidth onClick={onClose}>
              Отмена
            </Button>
          </div>
        </>
      )}
    </Modal>
  )
}

// Строка-чекбокс в стиле дизайн-системы (белая заливка, рамка). small — для
// вложенных строк помещений (чуть ниже).
function CheckRow({ checked, onChange, small, children }) {
  return (
    <label
      className="ele-checkbox"
      style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: small ? 40 : 44, padding: small ? '8px 12px' : '9px 14px', background: 'var(--color-surface)', borderRadius: 'var(--radius-control)', boxShadow: 'inset 0 0 0 1px var(--color-border-strong)', cursor: 'pointer' }}
    >
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="ele-checkbox__box" style={{ flex: 'none' }}>
        {checked ? <Icon name="check" size={12} strokeWidth={3} style={{ color: '#fff' }} /> : null}
      </span>
      {children}
    </label>
  )
}
