import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Banner, Button, Card, Icon, Input, PlaceSelect, Select, Spinner } from '../../shared/ui'
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
    // Из карточки сотрудника создаём сразу привязанной; из раздела — свободной
    // на складе (место хранения обязательно).
    if (!isEdit) {
      if (employeeId) {
        payload.employee = Number(employeeId)
      } else if (simType !== 'esim') {
        // Физическая свободная SIM хранится на складе; E-SIM виртуальна — без склада.
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
          <h1 className="ele-form-head__title">{isEdit ? 'Редактирование SIM-карты' : 'Новая SIM-карта'}</h1>
          <div style={{ display: 'flex', gap: 10, flex: 'none' }}>
            <Button variant="secondary" onClick={() => navigate(-1)} aria-label="Отмена">
              <span className="ele-only-desktop">Отмена</span>
              <Icon className="ele-only-mobile" name="x" size={18} strokeWidth={2} />
            </Button>
            <Button loading={submitting} onClick={submit} aria-label="Сохранить">
              <span className="ele-only-desktop">Сохранить</span>
              <Icon className="ele-only-mobile" name="check" size={18} strokeWidth={2.2} />
            </Button>
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

          {!isEdit && !employeeId && simType !== 'esim' ? (
            <Card>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Место хранения</div>
              <div style={{ fontSize: 13, color: 'var(--color-text-placeholder)', marginBottom: 14 }}>
                Свободная SIM-карта хранится на складе. Закрепить за сотрудником или оборудованием можно на карточке.
              </div>
              <PlaceSelect placeType="storage" label={null} required value={storagePlaceId} onChange={setStoragePlaceId} />
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
      </div>
    </div>
  )
}
