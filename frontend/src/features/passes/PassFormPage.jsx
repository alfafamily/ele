import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { apiGet } from '../../shared/api/client'
import { EmployeePicker } from '../../shared/EmployeePicker.jsx'
import { ModeToggle } from '../../shared/ModeToggle.jsx'
import { SelectedEmployee } from '../../shared/SelectedEmployee.jsx'
import { BackButton, Badge, Banner, Card, FormActions, Icon, Input, PlaceSelect, Spinner } from '../../shared/ui'
import { getBuildings } from '../premises/premisesApi.js'
import { createPass, getPass, updatePass } from '../employees/employeesApi.js'
import { generateNextNumber } from '../settings/settingsApi.js'

// Создание/редактирование средства доступа (пропуск СКУД или ключ) —
// полноценная страница (как у оборудования и лицензий). Пропуск может действовать
// в нескольких зданиях/помещениях; ключ — строго один объект (радио-поведение).
// При создании из карточки сотрудника ?employee=<id> — создаём сразу привязанным
// и возвращаемся на карточку сотрудника.
//
// Объектом доступа (B15) можно выбрать только здание/помещение/место с флагом
// «Требуется ключ/пропуск». Невыбираемые родители (без флага, но с отмеченным
// вложенным объектом) показываются задизейбленными — чтобы до вложенного объекта
// можно было раскрыться; здание, внутри которого выбрано помещение/место, идёт в
// набор как контейнер (собственный флаг ему не нужен). Ветви без единого флага не
// показываются вовсе.
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
  // selBuildings — только «здания целиком»; помещения/места хранятся отдельно.
  // Итоговый набор зданий (building_ids) вычисляется при отправке объединением
  // с родителями выбранных помещений/мест (см. submit).
  const [selBuildings, setSelBuildings] = useState(() => new Set())
  const [selRooms, setSelRooms] = useState(() => new Set())
  const [selPlaces, setSelPlaces] = useState(() => new Set())
  const [expanded, setExpanded] = useState(() => new Set()) // ключи 'b:<id>' / 'r:<id>'
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
      // Реконструкция «здания целиком»: здание считается выбранным целиком, только
      // если внутри него не выбрано ни одного помещения/места (иначе это контейнер).
      const rooms = pass.rooms || []
      const places = pass.places || []
      const narrowedBuildings = new Set([...rooms.map((r) => r.building), ...places.map((p) => p.building)])
      setSelBuildings(new Set((pass.buildings || []).filter((b) => !narrowedBuildings.has(b.id)).map((b) => b.id)))
      setSelRooms(new Set(rooms.map((r) => r.id)))
      setSelPlaces(new Set(places.map((p) => p.id)))
      // Раскрываем ветви с выбранными вложенными объектами.
      const exp = new Set()
      rooms.forEach((r) => exp.add(`b:${r.building}`))
      places.forEach((p) => { exp.add(`b:${p.building}`); exp.add(`r:${p.room}`) })
      setExpanded(exp)
      setPrefilled(true)
    })
  }, [id, isEdit])

  // Видимость и выбираемость (B15). Объект выбираем только с флагом; уже выбранные
  // показываем всегда (обратная совместимость при редактировании). Родитель виден,
  // если у него есть флаг или внутри есть видимый (флажковый/выбранный) объект.
  const placeVisible = (p) => !p.is_archived && (p.requires_pass || selPlaces.has(p.id))
  const visiblePlacesOf = (r) => (r.places || []).filter(placeVisible)
  const roomVisible = (r) => !r.is_archived && (r.requires_pass || selRooms.has(r.id) || visiblePlacesOf(r).length > 0)
  const visibleRoomsOf = (b) => (b.rooms || []).filter(roomVisible)
  const buildingVisible = (b) => b.requires_pass || selBuildings.has(b.id) || visibleRoomsOf(b).length > 0
  const visibleBuildings = () => (buildings || []).filter(buildingVisible)
  const roomSelectable = (r) => r.requires_pass || selRooms.has(r.id)
  const buildingSelectable = (b) => b.requires_pass || selBuildings.has(b.id)

  const isExpanded = (key) => expanded.has(key)
  const toggleExpand = (key) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const setOnly = (setter, value) => setter(value == null ? new Set() : new Set([value]))

  // Выбор «здания целиком».
  const toggleBuilding = (b, checked) => {
    if (isKey) {
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
    if (checked) {
      // «Здание целиком» перекрывает точечные выборы внутри него — снимаем их.
      const roomIds = new Set((b.rooms || []).map((r) => r.id))
      const placeIds = new Set((b.rooms || []).flatMap((r) => (r.places || []).map((p) => p.id)))
      setSelRooms((prev) => new Set([...prev].filter((rid) => !roomIds.has(rid))))
      setSelPlaces((prev) => new Set([...prev].filter((pid) => !placeIds.has(pid))))
    }
  }

  const toggleRoom = (b, room, checked) => {
    if (isKey) {
      setSelBuildings(new Set())
      setSelPlaces(new Set())
      setOnly(setSelRooms, checked ? room.id : null)
      return
    }
    // Выбор помещения означает, что здание — контейнер (не «целиком»).
    setSelBuildings((prev) => new Set([...prev].filter((bid) => bid !== b.id)))
    setSelRooms((prev) => {
      const next = new Set(prev)
      if (checked) next.add(room.id)
      else next.delete(room.id)
      return next
    })
    if (checked) {
      // Помещение целиком перекрывает выбор мест внутри него.
      const placeIds = new Set((room.places || []).map((p) => p.id))
      setSelPlaces((prev) => new Set([...prev].filter((pid) => !placeIds.has(pid))))
    }
  }

  const togglePlace = (b, room, place, checked) => {
    if (isKey) {
      setSelBuildings(new Set())
      setSelRooms(new Set())
      setOnly(setSelPlaces, checked ? place.id : null)
      return
    }
    setSelBuildings((prev) => new Set([...prev].filter((bid) => bid !== b.id)))
    setSelRooms((prev) => new Set([...prev].filter((rid) => rid !== room.id)))
    setSelPlaces((prev) => {
      const next = new Set(prev)
      if (checked) next.add(place.id)
      else next.delete(place.id)
      return next
    })
  }

  const changeObjectType = (type) => {
    if (type === objectType) return
    setObjectType(type)
    // У ключа объект доступа один — при переключении оставляем максимум одно
    // «здание целиком», помещения/места сбрасываем.
    if (type === 'key') {
      setTypeVehicle(false)
      setTypePedestrian(false)
      setSelBuildings((prev) => new Set([...prev].slice(0, 1)))
      setSelRooms(new Set())
      setSelPlaces(new Set())
    }
  }

  const targetCount = selBuildings.size + selRooms.size + selPlaces.size

  const submit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    setFieldErrors({})
    // Итоговый набор зданий: «здания целиком» + здания-контейнеры выбранных
    // помещений/мест.
    const roomBuilding = new Map()
    const placeBuilding = new Map()
    ;(buildings || []).forEach((b) =>
      (b.rooms || []).forEach((r) => {
        roomBuilding.set(r.id, b.id)
        ;(r.places || []).forEach((p) => placeBuilding.set(p.id, b.id))
      })
    )
    const buildingIds = new Set(selBuildings)
    selRooms.forEach((rid) => { if (roomBuilding.has(rid)) buildingIds.add(roomBuilding.get(rid)) })
    selPlaces.forEach((pid) => { if (placeBuilding.has(pid)) buildingIds.add(placeBuilding.get(pid)) })
    const payload = {
      object_type: objectType,
      account_number: accountNumber,
      type_vehicle: isKey ? false : typeVehicle,
      type_pedestrian: isKey ? false : typePedestrian,
      building_ids: [...buildingIds],
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <BackButton />
            <h1 className="ele-form-head__title">{title}</h1>
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
              {visibleBuildings().length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
                  Нет зданий/помещений/мест, для которых требуется ключ/пропуск.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {visibleBuildings().map((b) => {
                    const wholeB = selBuildings.has(b.id)
                    const rooms = visibleRoomsOf(b)
                    const collapsible = buildingSelectable(b)
                    const showRooms = rooms.length > 0 && (!collapsible || isExpanded(`b:${b.id}`))
                    return (
                      <div key={b.id}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <ExpandToggle
                            shown={rooms.length > 0 && collapsible}
                            open={isExpanded(`b:${b.id}`)}
                            onClick={() => toggleExpand(`b:${b.id}`)}
                          />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <CheckRow checked={wholeB} disabled={!collapsible} onChange={(v) => toggleBuilding(b, v)}>
                              <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.name}</span>
                            </CheckRow>
                          </div>
                        </div>
                        {showRooms ? (
                          <div style={{ marginLeft: 15, marginTop: 6, paddingLeft: 14, borderLeft: '2px solid var(--color-border-strong)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {rooms.map((r) => {
                              const wholeR = selRooms.has(r.id)
                              const places = visiblePlacesOf(r)
                              const roomEnabled = roomSelectable(r) && !wholeB
                              const roomCollapsible = roomSelectable(r)
                              const showPlaces = places.length > 0 && (!roomCollapsible || isExpanded(`r:${r.id}`))
                              return (
                                <div key={r.id}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <ExpandToggle
                                      shown={places.length > 0 && roomCollapsible}
                                      open={isExpanded(`r:${r.id}`)}
                                      onClick={() => toggleExpand(`r:${r.id}`)}
                                      small
                                    />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <CheckRow small checked={wholeR} disabled={!roomEnabled} onChange={(v) => toggleRoom(b, r, v)}>
                                        {r.floor ? <Badge>эт. {r.floor}</Badge> : null}
                                        <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                                      </CheckRow>
                                    </div>
                                  </div>
                                  {showPlaces ? (
                                    <div style={{ marginLeft: 21, marginTop: 6, paddingLeft: 12, borderLeft: '2px solid var(--color-border-hairline)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                                      {places.map((p) => (
                                        <CheckRow
                                          key={p.id}
                                          small
                                          checked={selPlaces.has(p.id)}
                                          disabled={wholeB || wholeR}
                                          onChange={(v) => togglePlace(b, r, p, v)}
                                        >
                                          <span style={{ flex: 1, minWidth: 0, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                                        </CheckRow>
                                      ))}
                                    </div>
                                  ) : null}
                                </div>
                              )
                            })}
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
        {ready ? (
          <FormActions
            onCancel={() => navigate(-1)}
            onSubmit={submit}
            submitting={submitting}
            submitLabel={isEdit ? 'Сохранить' : 'Создать'}
            submitDisabled={targetCount === 0}
          />
        ) : null}
      </div>
    </div>
  )
}

// Кнопка-раскрытие (шеврон) слева от строки. Когда раскрывать нечего или ветвь
// раскрыта принудительно (родитель-контейнер) — рисуем распорку, чтобы строки
// не «прыгали» по горизонтали.
function ExpandToggle({ shown, open, onClick, small }) {
  const box = small ? 20 : 22
  if (!shown) return <span style={{ width: box, flex: 'none' }} />
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={open ? 'Свернуть' : 'Развернуть'}
      style={{ width: box, height: box, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, color: 'var(--color-text-placeholder)' }}
    >
      <Icon name="chevron-right" size={16} strokeWidth={2.2} style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .16s' }} />
    </button>
  )
}

// Строка-чекбокс в стиле дизайн-системы (белая заливка, рамка). small — для
// вложенных строк помещений/мест (чуть ниже). disabled — невыбираемый объект
// (родитель без флага либо перекрытый выбором «целиком»): только для раскрытия.
function CheckRow({ checked, onChange, small, disabled, children }) {
  return (
    <label
      className={'ele-checkbox' + (checked ? ' ele-option--selected' : '')}
      style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: small ? 40 : 44, padding: small ? '8px 12px' : '9px 14px', background: checked ? undefined : 'var(--color-surface)', borderRadius: 'var(--radius-control)', boxShadow: checked ? undefined : 'inset 0 0 0 1.5px var(--color-border-strong)', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.55 : 1 }}
    >
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="ele-checkbox__box" style={{ flex: 'none' }}>
        {checked ? <Icon name="check" size={12} strokeWidth={3} style={{ color: '#fff' }} /> : null}
      </span>
      {children}
    </label>
  )
}
