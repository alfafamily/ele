import { useState } from 'react'
import { EmployeePicker } from '../../shared/EmployeePicker.jsx'
import { SelectedEmployee } from '../../shared/SelectedEmployee.jsx'
import { Banner, Button, Checkbox, Icon, Input, Modal, ModalActions, RadioPills, Select } from '../../shared/ui'
import { splitApiError } from '../../shared/formErrors.js'
import { TransportPicker } from './TransportPicker.jsx'
import { createPlace, updatePlace } from './premisesApi.js'

// Создание/редактирование Места внутри помещения.
//  • В обычном помещении — Рабочее место / Место хранения (B8); за рабочим
//    местом можно закрепить нескольких сотрудников.
//  • В помещении-парковке — Парковочное место: одно место — один объект: либо
//    один сотрудник (личное авто), либо один транспорт компании.
export function PlaceModal({ room, place, onClose, onDone }) {
  const isEdit = Boolean(place)
  const isParking = Boolean(room?.is_parking)
  const [name, setName] = useState(place?.name || '')
  const [placeType, setPlaceType] = useState(place?.place_type || (isParking ? 'parking_spot' : 'workplace'))
  const [requiresPass, setRequiresPass] = useState(place?.requires_pass || false)
  // Рабочее место — несколько сотрудников.
  const [selected, setSelected] = useState(place?.employees_detail || [])
  // Парковочное место — режим + один сотрудник ЛИБО один транспорт.
  const [parkMode, setParkMode] = useState(place?.transport_detail?.length ? 'company' : 'personal')
  const [parkEmployee, setParkEmployee] = useState(place?.employees_detail?.[0] || null)
  const [parkTransport, setParkTransport] = useState(place?.transport_detail?.[0] || null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})

  const submit = async () => {
    if (!name.trim()) {
      setFieldErrors({ name: 'Укажите название или номер.' })
      setError(null)
      return
    }
    setSubmitting(true)
    setError(null)
    setFieldErrors({})
    const payload = isParking
      ? {
          room: room.id,
          name,
          place_type: 'parking_spot',
          requires_pass: requiresPass,
          employees: parkMode === 'personal' && parkEmployee ? [parkEmployee.id] : [],
          transport: parkMode === 'company' && parkTransport ? [parkTransport.id] : [],
        }
      : {
          room: room.id,
          name,
          place_type: placeType,
          requires_pass: requiresPass,
          employees: placeType === 'workplace' ? selected.map((e) => e.id) : [],
          transport: [],
        }
    try {
      const saved = isEdit ? await updatePlace(place.id, payload) : await createPlace(payload)
      onDone(saved)
    } catch (err) {
      const { fieldErrors: fe, formError } = splitApiError(err)
      setFieldErrors(fe)
      setError(formError || 'Не удалось сохранить место.')
    } finally {
      setSubmitting(false)
    }
  }

  const titleNoun = isParking ? 'парковочного места' : 'места'

  return (
    <Modal open onClose={onClose} title={isEdit ? `Редактирование ${titleNoun}` : `Новое ${isParking ? 'парковочное место' : 'место'}`}>
      {error ? <Banner variant="error">{error}</Banner> : null}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, margin: '4px 0 20px' }}>
        <Input
          label="Название / номер"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={fieldErrors.name}
        />

        {isParking ? (
          <>
            <div>
              <div style={LABEL}>Закрепление</div>
              <RadioPills
                value={parkMode}
                onChange={setParkMode}
                options={[
                  { value: 'personal', label: 'Личный авто' },
                  { value: 'company', label: 'Транспорт компании' },
                ]}
              />
            </div>
            {parkMode === 'personal' ? (
              <PersonalCar value={parkEmployee} onChange={setParkEmployee} />
            ) : (
              <CompanyTransport value={parkTransport} onChange={setParkTransport} />
            )}
          </>
        ) : (
          <>
            <Select label="Тип места" required value={placeType} onChange={setPlaceType} error={fieldErrors.place_type}>
              <option value="workplace">Рабочее место</option>
              <option value="common">Место общего пользования</option>
              <option value="storage">Место хранения</option>
            </Select>
            {placeType === 'workplace' ? (
              <WorkplaceEmployees selected={selected} onChange={setSelected} />
            ) : null}
          </>
        )}

        <Checkbox label="Требуется ключ/пропуск" checked={requiresPass} onChange={setRequiresPass} />
      </div>
      <ModalActions>
        <Button fullWidth loading={submitting} onClick={submit}>
          {isEdit ? 'Сохранить' : 'Создать'}
        </Button>
        <Button variant="secondary" fullWidth onClick={onClose}>
          Отмена
        </Button>
      </ModalActions>
    </Modal>
  )
}

const LABEL = { fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 6 }

// Множественный выбор сотрудников за рабочим местом.
function WorkplaceEmployees({ selected, onChange }) {
  const selectedIds = new Set(selected.map((e) => e.id))
  const add = (emp) => {
    if (!selectedIds.has(emp.id)) onChange([...selected, { id: emp.id, name: emp.full_name, avatar: emp.avatar || null }])
  }
  const remove = (id) => onChange(selected.filter((e) => e.id !== id))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Закреплённые сотрудники</div>
      {selected.length ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {selected.map((e) => (
            <SelectedEmployee key={e.id} employee={e} onClear={() => remove(e.id)} />
          ))}
        </div>
      ) : null}
      <EmployeePicker onSelect={add} excludeIds={selected.map((e) => e.id)} />
    </div>
  )
}

// Личное авто сотрудника — один сотрудник (пикер → выбранный с крестиком).
function PersonalCar({ value, onChange }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Личный авто сотрудника</div>
      {value ? (
        <SelectedEmployee employee={value} onClear={() => onChange(null)} />
      ) : (
        <EmployeePicker onSelect={(emp) => onChange({ id: emp.id, name: emp.full_name, avatar: emp.avatar || null })} />
      )}
    </div>
  )
}

// Транспорт компании — один транспорт (пикер → выбранный с крестиком).
function CompanyTransport({ value, onChange }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Транспорт компании</div>
      {value ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 11px', borderRadius: 10, boxShadow: 'inset 0 0 0 1px var(--color-border)' }}>
          <Icon name="car" size={16} style={{ color: 'var(--color-text-muted)', flex: 'none' }} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {value.type_and_model}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--color-text-placeholder)' }}>
              {[value.plate, `№ ${value.inventory_number}`].filter(Boolean).join(' · ')}
            </div>
          </span>
          <button
            type="button"
            onClick={() => onChange(null)}
            style={{ border: 'none', background: 'none', color: 'var(--color-text-placeholder)', cursor: 'pointer', padding: 4, flex: 'none' }}
            aria-label="Убрать"
          >
            <Icon name="x" size={16} />
          </button>
        </div>
      ) : (
        <TransportPicker onSelect={onChange} excludeIds={[]} />
      )}
    </div>
  )
}
