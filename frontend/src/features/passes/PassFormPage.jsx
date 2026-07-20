import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { apiGet } from '../../shared/api/client'
import { EmployeePicker } from '../../shared/EmployeePicker.jsx'
import { ModeToggle } from '../../shared/ModeToggle.jsx'
import { SelectedEmployee } from '../../shared/SelectedEmployee.jsx'
import { Badge, Banner, Button, Card, Icon, Input, PlaceSelect, Spinner } from '../../shared/ui'
import { getBuildings } from '../premises/premisesApi.js'
import { createPass, getPass, updatePass } from '../employees/employeesApi.js'
import { generateNextNumber } from '../settings/settingsApi.js'

// Создание/редактирование средства доступа (пропуск СКУД или ключ) —
// полноценная страница (как у оборудования и лицензий). Пропуск может действовать
// в нескольких зданиях/помещениях; ключ — строго один объект (радио-поведение).
// При создании из карточки сотрудника ?employee=<id> — создаём сразу привязанным
// и возвращаемся на карточку сотрудника.
export function PassFormPage() {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const employeeId = searchParams.get('employee')

  const [buildings, setBuildings] = useState(null)
  const [prefilled, setPrefilled] = useState(!isEdit)
  const [objectType, setObjectType] = useState('pass')
  const [accountNumber, setAccountNumber] = useState('')
  const [typeVehicle, setTypeVehicle] = useState(false)
  const [typePedestrian, setTypePedestrian] = useState(false)
  const [selBuildings, setSelBuildings] = useState(() => new Set())
  const [selRooms, setSelRooms] = useState(() => new Set())
  const [selPlaces, setSelPlaces] = useState(() => new Set())
  const [comment, setComment] = useState('')
  const [placementMode, setPlacementMode] = useState(employeeId ? 'employee' : 'storage')
  const [placementEmployee, setPlacementEmployee] = useState(null)
  const [storagePlaceId, setStoragePlaceId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})
  const [genLoading, setGenLoading] = useState(false)

  const isKey = objectType === 'key'

  // Автонумератор: подставить следующий учётный номер для текущего типа объекта
  // (ключ/пропуск — свои счётчики). Счётчик на сервере сгорает сразу.
  const generateNumber = async () => {
    setGenLoading(true)
    setError(null)
    try {
      const { number } = await generateNextNumber(isKey ? 'key' : 'pass')
      setAccountNumber(number)
    } catch (err) {
      setError(err?.detail || 'Не удалось сгенерировать номер.')
    } finally {
      setGenLoading(false)
    }
  }

  useEffect(() => {
    getBuildings().then(setBuildings)
  }, [])

  useEffect(() => {
    if (employeeId) apiGet(`/api/employees/${employeeId}/`).then(setPlacementEmployee).catch(() => {})
  }, [employeeId])

  useEffect(() => {
    if (!isEdit) return
    getPass(id).then((pass) => {
      setObjectType(pass.object_type || 'pass')
      setAccountNumber(pass.account_number || '')
      setTypeVehicle(pass.type_vehicle || false)
      setTypePedestrian(pass.type_pedestrian || false)
      setSelBuildings(new Set((pass.buildings || []).map((b) => b.id)))
      setSelRooms(new Set((pass.rooms || []).map((r) => r.id)))
      setSelPlaces(new Set((pass.places || []).map((p) => p.id)))
      setPrefilled(true)
    })
  }, [id, isEdit])

  const activeRoomsOf = (b) => (b.rooms || []).filter((r) => !r.is_archived)
  // Места, которые можно выбрать как объект доступа: только с флагом
  // «Требуется ключ/пропуск» и не в архиве.
  const passPlacesOf = (r) => (r.places || []).filter((p) => p.requires_pass && !p.is_archived)

  const toggleBuilding = (b, checked) => {
    if (isKey) {
      // Ключ: одно здание целиком, помещения и места сбрасываются.
      setSelBuildings(checked ? new Set([b.id]) : new Set())
      setSelRooms(new Set())
      setSelPlaces(new Set())
      return
    }
    setSelBuildings((prev) => {
      const next = new Set(prev)
      if (checked) next.add(b.id)
      else next.delete(b.id)
      return next
    })
    if (!checked) {
      const rooms = activeRoomsOf(b)
      const roomIds = new Set(rooms.map((r) => r.id))
      const placeIds = new Set(rooms.flatMap((r) => passPlacesOf(r).map((p) => p.id)))
      setSelRooms((prev) => new Set([...prev].filter((rid) => !roomIds.has(rid))))
      setSelPlaces((prev) => new Set([...prev].filter((pid) => !placeIds.has(pid))))
    }
  }

  const toggleRoom = (b, roomId, checked) => {
    if (isKey) {
      // Ключ: одно помещение (его здание — родитель), место сбрасывается.
      if (checked) {
        setSelBuildings(new Set([b.id]))
        setSelRooms(new Set([roomId]))
        setSelPlaces(new Set())
      } else {
        setSelRooms(new Set())
      }
      return
    }
    setSelRooms((prev) => {
      const next = new Set(prev)
      if (checked) next.add(roomId)
      else next.delete(roomId)
      return next
    })
  }

  const togglePlace = (b, placeId, checked) => {
    if (isKey) {
      // Ключ: одно место (его здание — родитель), помещение сбрасывается.
      if (checked) {
        setSelBuildings(new Set([b.id]))
        setSelRooms(new Set())
        setSelPlaces(new Set([placeId]))
      } else {
        setSelPlaces(new Set())
      }
      return
    }
    setSelPlaces((prev) => {
      const next = new Set(prev)
      if (checked) next.add(placeId)
      else next.delete(placeId)
      return next
    })
  }

  const changeObjectType = (type) => {
    if (type === objectType) return
    setObjectType(type)
    // При переключении на ключ оставляем максимум одно здание, помещения/места
    // сбрасываем (у ключа объект доступа один).
    if (type === 'key') {
      setTypeVehicle(false)
      setTypePedestrian(false)
      setSelBuildings((prev) => new Set([...prev].slice(0, 1)))
      setSelRooms(new Set())
      setSelPlaces(new Set())
    }
  }

  const submit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    setFieldErrors({})
    const payload = {
      object_type: objectType,
      account_number: accountNumber,
      type_vehicle: isKey ? false : typeVehicle,
      type_pedestrian: isKey ? false : typePedestrian,
      building_ids: [...selBuildings],
      room_ids: [...selRooms],
      place_ids: [...selPlaces],
    }
    // Размещение при создании: за сотрудником или на складе.
    if (!isEdit) {
      if (placementMode === 'employee') {
        if (!placementEmployee) {
          setError('Выберите сотрудника или место хранения.')
          setSubmitting(false)
          return
        }
        payload.employee = placementEmployee.id
      } else {
        if (!storagePlaceId) {
          setError('Укажите место хранения для свободного пропуска/ключа.')
          setSubmitting(false)
          return
        }
        payload.storage_place = Number(storagePlaceId)
      }
    }
    if (!isEdit && comment.trim()) payload.comment = comment.trim()
    try {
      if (isEdit) {
        await updatePass(id, payload)
        navigate(-1)
      } else {
        const created = await createPass(payload)
        // replace — чтобы форма создания не оставалась в истории. При создании из
        // карточки сотрудника возвращаемся на неё, иначе — на карточку средства.
        navigate(employeeId ? `/employees/${employeeId}` : `/passes/${created.id}`, { replace: true })
      }
    } catch (err) {
      if (err.errors) {
        setFieldErrors(err.errors)
      } else {
        setError(err.detail || 'Не удалось сохранить средство доступа.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const title = isEdit ? (isKey ? 'Редактирование ключа' : 'Редактирование пропуска') : 'Новое средство доступа'
  const ready = buildings !== null && prefilled

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ width: '100%', maxWidth: 660 }}>
        <div className="ele-form-head">
          <h1 className="ele-form-head__title">{title}</h1>
          <div style={{ display: 'flex', gap: 10, flex: 'none' }}>
            <Button variant="secondary" onClick={() => navigate(-1)} aria-label="Отмена">
              <span className="ele-only-desktop">Отмена</span>
              <Icon className="ele-only-mobile" name="x" size={18} strokeWidth={2} />
            </Button>
            <Button loading={submitting} disabled={!ready || selBuildings.size === 0} onClick={submit} aria-label="Сохранить">
              <span className="ele-only-desktop">Сохранить</span>
              <Icon className="ele-only-mobile" name="check" size={18} strokeWidth={2.2} />
            </Button>
          </div>
        </div>

        {error ? <Banner variant="error">{error}</Banner> : null}

        {!ready ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
            <Spinner />
          </div>
        ) : (
          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: error ? 16 : 0 }}>
            <Card>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Основная информация</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)', marginBottom: 8 }}>Тип объекта</div>
                  <div className="ele-segmented">
                    <button
                      type="button"
                      className={'ele-segmented__btn' + (!isKey ? ' ele-segmented__btn--active' : '')}
                      onClick={() => changeObjectType('pass')}
                    >
                      Пропуск СКУД
                    </button>
                    <button
                      type="button"
                      className={'ele-segmented__btn' + (isKey ? ' ele-segmented__btn--active' : '')}
                      onClick={() => changeObjectType('key')}
                    >
                      Ключ
                    </button>
                  </div>
                </div>

                <Input
                  label="Учётный номер"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  error={fieldErrors.account_number}
                  trailing={!isEdit ? (
                    <button
                      type="button"
                      className="ele-field__icon-btn"
                      onClick={generateNumber}
                      disabled={genLoading}
                      title="Сгенерировать номер"
                      aria-label="Сгенерировать учётный номер"
                    >
                      <Icon name="pencil-sparkles" size={18} />
                    </button>
                  ) : null}
                />

                {!isKey ? (
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
                ) : null}
              </div>
            </Card>

            <Card>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
                {isKey ? 'Здание или помещение' : 'Здания и помещения'}
              </div>
              {isKey ? (
                <div style={{ fontSize: 13, color: 'var(--color-text-placeholder)', marginBottom: 14 }}>
                  У ключа доступен строго один объект: отметьте здание целиком, одно помещение или одно место.
                </div>
              ) : null}
              {buildings.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Зданий пока нет.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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
                              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                                {isKey ? 'В здании нет помещений — ключ действует на всё здание.' : 'В здании нет помещений — пропуск действует на всё здание.'}
                              </div>
                            ) : (
                              <>
                                {rooms.map((r) => {
                                  const places = passPlacesOf(r)
                                  return (
                                    <div key={r.id}>
                                      <CheckRow small checked={selRooms.has(r.id)} onChange={(v) => toggleRoom(b, r.id, v)}>
                                        {r.floor ? <Badge>эт. {r.floor}</Badge> : null}
                                        <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                                      </CheckRow>
                                      {places.length ? (
                                        <div style={{ marginLeft: 14, marginTop: 6, paddingLeft: 12, borderLeft: '2px solid var(--color-border-hairline)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                                          {places.map((p) => (
                                            <CheckRow key={p.id} small checked={selPlaces.has(p.id)} onChange={(v) => togglePlace(b, p.id, v)}>
                                              <span style={{ flex: 1, minWidth: 0, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                                            </CheckRow>
                                          ))}
                                        </div>
                                      ) : null}
                                    </div>
                                  )
                                })}
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
              {fieldErrors.place_ids ? (
                <div style={{ fontSize: 12, color: 'var(--color-error)', marginTop: 4 }}>
                  {Array.isArray(fieldErrors.place_ids) ? fieldErrors.place_ids[0] : fieldErrors.place_ids}
                </div>
              ) : null}
            </Card>

            {!isEdit ? (
              <Card>
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Размещение</div>
                <div style={{ fontSize: 13, color: 'var(--color-text-placeholder)', marginBottom: 14 }}>
                  {employeeId
                    ? 'Средство доступа будет закреплено за сотрудником.'
                    : 'За сотрудником или на складе (место хранения).'}
                </div>
                {employeeId ? (
                  placementEmployee ? <SelectedEmployee employee={placementEmployee} /> : null
                ) : (
                  <>
                    <ModeToggle
                      mode={placementMode}
                      onChange={(m) => { setPlacementMode(m); setStoragePlaceId('') }}
                      options={[{ value: 'employee', label: 'За сотрудником' }, { value: 'storage', label: 'На складе' }]}
                    />
                    {placementMode === 'employee' ? (
                      placementEmployee ? (
                        <SelectedEmployee employee={placementEmployee} onClear={() => setPlacementEmployee(null)} />
                      ) : (
                        <EmployeePicker onSelect={setPlacementEmployee} />
                      )
                    ) : (
                      <PlaceSelect placeType="storage" label={null} required value={storagePlaceId} onChange={setStoragePlaceId} />
                    )}
                  </>
                )}
              </Card>
            ) : null}

            {!isEdit ? (
              <Card>
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Комментарий</div>
                <div style={{ fontSize: 13, color: 'var(--color-text-placeholder)', marginBottom: 14 }}>
                  Необязательный. Отобразится в истории движений в записи создания.
                </div>
                <Input
                  multiline
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Например: приобретено по договору или изготовлено у мастера (для ключей)"
                />
              </Card>
            ) : null}
          </form>
        )}
      </div>
    </div>
  )
}

// Строка-чекбокс в стиле дизайн-системы (белая заливка, рамка). small — для
// вложенных строк помещений (чуть ниже).
function CheckRow({ checked, onChange, small, children }) {
  return (
    <label
      className={'ele-checkbox' + (checked ? ' ele-option--selected' : '')}
      style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: small ? 40 : 44, padding: small ? '8px 12px' : '9px 14px', background: checked ? undefined : 'var(--color-surface)', borderRadius: 'var(--radius-control)', boxShadow: checked ? undefined : 'inset 0 0 0 1.5px var(--color-border-strong)', cursor: 'pointer' }}
    >
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="ele-checkbox__box" style={{ flex: 'none' }}>
        {checked ? <Icon name="check" size={12} strokeWidth={3} style={{ color: '#fff' }} /> : null}
      </span>
      {children}
    </label>
  )
}
