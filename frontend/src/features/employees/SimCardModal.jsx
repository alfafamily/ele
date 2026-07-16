import { useEffect, useState } from 'react'
import { Banner, Button, Input, Modal, Select } from '../../shared/ui'
import { createSimCard, getSimOperators, getSimProviders, updateSimCard } from './employeesApi.js'

// Добавление/редактирование корпоративной SIM/E-SIM сотрудника. Отдельного
// справочника номеров нет — «Оператор» и «Поставщик услуг связи» вводятся
// свободно с автоподсказкой по встречавшимся значениям (как «Отдел»).
export function SimCardModal({ employeeId, sim, onClose, onDone }) {
  const isEdit = Boolean(sim)
  const [simType, setSimType] = useState(sim?.sim_type || 'sim')
  const [phoneNumber, setPhoneNumber] = useState(sim?.phone_number || '')
  const [networkOperator, setNetworkOperator] = useState(sim?.network_operator || '')
  const [provider, setProvider] = useState(sim?.provider || '')
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

  const submit = async () => {
    setSubmitting(true)
    setError(null)
    setFieldErrors({})
    const payload = {
      sim_type: simType,
      phone_number: phoneNumber,
      network_operator: networkOperator,
      provider,
    }
    // Из карточки сотрудника создаём сразу привязанной; из раздела — свободной.
    if (!isEdit && employeeId) payload.employee = employeeId
    if (!isEdit && comment.trim()) payload.comment = comment.trim()
    try {
      const saved = isEdit ? await updateSimCard(sim.id, payload) : await createSimCard(payload)
      onDone(saved)
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
    <Modal open onClose={onClose} title={isEdit ? 'Редактирование SIM-карты' : 'Новая SIM-карта'}>
      {error ? <Banner variant="error">{error}</Banner> : null}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, margin: '4px 0 20px' }}>
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
        {!isEdit ? (
          <Input
            label="Комментарий (необязательно)"
            multiline
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Отобразится в истории движений при создании"
          />
        ) : null}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Button fullWidth loading={submitting} onClick={submit}>
          Сохранить
        </Button>
        <Button variant="secondary" fullWidth onClick={onClose}>
          Отмена
        </Button>
      </div>
    </Modal>
  )
}
