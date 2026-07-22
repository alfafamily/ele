import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { apiGet } from '../../shared/api/client'
import { EmployeePicker } from '../../shared/EmployeePicker.jsx'
import { EquipmentPicker } from '../../shared/EquipmentPicker.jsx'
import { ModeToggle } from '../../shared/ModeToggle.jsx'
import { SelectedEmployee } from '../../shared/SelectedEmployee.jsx'
import { BackButton, Banner, Card, FormActions, Icon, Input, PlaceSelect, Select, Spinner } from '../../shared/ui'
import {
  createSimCard,
  getSimCard,
  getSimOperators,
  getSimProviders,
  updateSimCard,
} from '../employees/employeesApi.js'

// Создание/редактирование корпоративной SIM/E-SIM — полноценная страница (как у
// оборудования и лицензий). При создании из карточки сотрудника номер приходит в
// query-параметре ?employee=<id> — тогда SIM создаётся сразу привязанной, и после
// сохранения возвращаемся на карточку сотрудника.
export function SimFormPage() {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const employeeId = searchParams.get('employee')

  const [loaded, setLoaded] = useState(!isEdit)
  const [simType, setSimType] = useState('sim')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [networkOperator, setNetworkOperator] = useState('')
  const [provider, setProvider] = useState('')
  const [placementMode, setPlacementMode] = useState(employeeId ? 'employee' : 'storage')
  const [placementEmployee, setPlacementEmployee] = useState(null)
  const [placementEquipment, setPlacementEquipment] = useState(null)
  const [storagePlaceId, setStoragePlaceId] = useState('')
  const [comment, setComment] = useState('')
  const [operators, setOperators] = useState([])
  const [providers, setProviders] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})

  useEffect(() => {
    getSimOperators().then(setOperators)
    getSimProviders().then(setProviders)
  }, [])

  useEffect(() => {
    if (employeeId) apiGet(`/api/employees/${employeeId}/`).then(setPlacementEmployee).catch(() => {})
  }, [employeeId])

  // E-SIM виртуальна — на складе не хранится: если был выбран склад, переключаем
  // на сотрудника (для E-SIM доступно только закрепление за сотрудником).
  useEffect(() => {
    if (simType === 'esim' && placementMode === 'storage') setPlacementMode('employee')
  }, [simType, placementMode])

  useEffect(() => {
    if (!isEdit) return
    getSimCard(id).then((sim) => {
      setSimType(sim.sim_type || 'sim')
      setPhoneNumber(sim.phone_number || '')
      setNetworkOperator(sim.network_operator || '')
      setProvider(sim.provider || '')
      setLoaded(true)
    })
  }, [id, isEdit])

  if (!loaded) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
        <Spinner />
      </div>
    )
  }

  const submit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    setFieldErrors({})
    const payload = {
      sim_type: simType,
      phone_number: phoneNumber,
      network_operator: networkOperator,
      provider,
    }
    // Размещение при создании: за сотрудником, в оборудовании или на складе
    // (E-SIM — за сотрудником/в оборудовании или свободна, без склада).
    if (!isEdit) {
      if (placementMode === 'employee') {
        if (placementEmployee) {
          payload.employee = placementEmployee.id
        } else if (simType !== 'esim') {
          setError('Выберите сотрудника, оборудование или место хранения.')
          setSubmitting(false)
          return
        }
      } else if (placementMode === 'equipment') {
        if (!placementEquipment) {
          setError('Выберите оборудование.')
          setSubmitting(false)
          return
        }
        payload.equipment = placementEquipment.id
      } else {
        if (!storagePlaceId) {
          setError('Укажите место хранения для свободной SIM-карты.')
          setSubmitting(false)
          return
        }
        payload.storage_place = Number(storagePlaceId)
      }
    }
    if (!isEdit && comment.trim()) payload.comment = comment.trim()
    try {
      if (isEdit) {
        await updateSimCard(id, payload)
        navigate(-1)
      } else {
        const created = await createSimCard(payload)
        // replace — чтобы форма создания не оставалась в истории. При создании из
        // карточки сотрудника возвращаемся на неё, иначе — на карточку новой SIM.
        navigate(employeeId ? `/employees/${employeeId}` : `/sim-cards/${created.id}`, { replace: true })
      }
    } catch (err) {
      if (err.errors) {
        setFieldErrors(err.errors)
      } else {
        setError(err.detail || 'Не удалось сохранить SIM-карту.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ width: '100%', maxWidth: 660 }}>
        <div className="ele-form-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <BackButton />
            <h1 className="ele-form-head__title">{isEdit ? 'Редактирование SIM-карты' : 'Новая SIM-карта'}</h1>
          </div>
        </div>

        {error ? <Banner variant="error">{error}</Banner> : null}

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: error ? 16 : 0 }}>
          <Card>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Основная информация</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Select label="Тип" value={simType} onChange={setSimType} error={fieldErrors.sim_type}>
                <option value="sim">SIM</option>
                <option value="esim">E-SIM</option>
              </Select>
              <Input
                label="Номер телефона"
                required
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                error={fieldErrors.phone_number}
              />
              <div>
                <Input
                  label="Оператор"
                  list="sim-operator-options"
                  value={networkOperator}
                  onChange={(e) => setNetworkOperator(e.target.value)}
                  error={fieldErrors.network_operator}
                />
                <datalist id="sim-operator-options">
                  {operators.map((o) => (
                    <option key={o} value={o} />
                  ))}
                </datalist>
              </div>
              <div>
                <Input
                  label="Поставщик"
                  list="sim-provider-options"
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                  error={fieldErrors.provider}
                />
                <datalist id="sim-provider-options">
                  {providers.map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
              </div>
            </div>
          </Card>

          {!isEdit ? (
            <Card>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Размещение</div>
              <div style={{ fontSize: 13, color: 'var(--color-text-placeholder)', marginBottom: 14 }}>
                {employeeId
                  ? 'SIM-карта будет закреплена за сотрудником.'
                  : simType === 'esim'
                    ? 'E-SIM виртуальна: закрепите за сотрудником, установите в оборудование или оставьте свободной (на хранении у оператора).'
                    : 'За сотрудником, в оборудовании или на складе (место хранения).'}
              </div>
              {employeeId ? (
                placementEmployee ? <SelectedEmployee employee={placementEmployee} /> : null
              ) : (
                <>
                  <ModeToggle
                    mode={placementMode}
                    onChange={(m) => { setPlacementMode(m); setStoragePlaceId(''); setPlacementEquipment(null) }}
                    options={[
                      { value: 'employee', label: 'За сотрудником' },
                      { value: 'equipment', label: 'В оборудовании' },
                      ...(simType !== 'esim' ? [{ value: 'storage', label: 'На складе' }] : []),
                    ]}
                  />
                  {placementMode === 'employee' ? (
                    placementEmployee ? (
                      <SelectedEmployee employee={placementEmployee} onClear={() => setPlacementEmployee(null)} />
                    ) : (
                      <EmployeePicker onSelect={setPlacementEmployee} />
                    )
                  ) : placementMode === 'equipment' ? (
                    placementEquipment ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', background: 'var(--color-fill-input)', borderRadius: 10 }}>
                        <Icon name="tag" size={16} strokeWidth={2} style={{ color: 'var(--color-text-muted)', flex: 'none' }} />
                        <span style={{ minWidth: 0, flex: 1 }}>
                          <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{placementEquipment.type_and_model}</span>
                          <span style={{ display: 'block', fontSize: 11.5, color: 'var(--color-text-placeholder)', fontFamily: 'var(--font-mono)' }}>{placementEquipment.inventory_number}</span>
                        </span>
                        <button type="button" onClick={() => setPlacementEquipment(null)} title="Изменить" aria-label="Изменить" style={{ width: 28, height: 28, flex: 'none', borderRadius: 8, background: 'var(--color-surface)', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'inset 0 0 0 1px var(--color-border)' }}>
                          <Icon name="x" size={15} strokeWidth={2} />
                        </button>
                      </div>
                    ) : (
                      <EquipmentPicker simOnly onSelect={setPlacementEquipment} />
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
                placeholder="Например: регистрация номера по договору услуг-связи"
              />
            </Card>
          ) : null}
        </form>

        <FormActions
          onCancel={() => navigate(-1)}
          onSubmit={submit}
          submitting={submitting}
          submitLabel={isEdit ? 'Сохранить' : 'Создать'}
        />
      </div>
    </div>
  )
}
