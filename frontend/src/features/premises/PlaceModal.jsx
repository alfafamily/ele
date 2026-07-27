import { useState } from 'react'
import { EmployeePicker } from '../../shared/EmployeePicker.jsx'
import { SelectedEmployee } from '../../shared/SelectedEmployee.jsx'
import { Banner, Button, Checkbox, Icon, Input, Modal, RadioPills, Select } from '../../shared/ui'
import { TransportPicker } from './TransportPicker.jsx'
import { createPlace, updatePlace } from './premisesApi.js'

// Создание/редактирование Места внутри помещения.
//  • В обычном помещении — Рабочее место / Место хранения (B8); за рабочим
//    местом можно закрепить сотрудников.
//  • В помещении-парковке — Парковочное место: за ним закрепляют либо личные
//    авто сотрудников («Личный авто»), либо транспорт компании («Транспорт
//    компании») — что-то одно.
export function PlaceModal({ room, place, onClose, onDone }) {
  const isEdit = Boolean(place)
  const isParking = Boolean(room?.is_parking)
  const [name, setName] = useState(place?.name || '')
  const [placeType, setPlaceType] = useState(place?.place_type || (isParking ? 'parking_spot' : 'workplace'))
  const [requiresPass, setRequiresPass] = useState(place?.requires_pass || false)
  const [selected, setSelected] = useState(place?.employees_detail || [])
  // Парковочное место: режим закрепления + выбранный транспорт.
  const [parkMode, setParkMode] = useState(place?.transport_detail?.length ? 'company' : 'personal')
  const [transport, setTransport] = useState(place?.transport_detail || [])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})

  const submit = async () => {
    setSubmitting(true)
    setError(null)
    setFieldErrors({})
    const payload = isParking
      ? {
          room: room.id,
          name,
          place_type: 'parking_spot',
          requires_pass: requiresPass,
          employees: parkMode === 'personal' ? selected.map((e) => e.id) : [],
          transport: parkMode === 'company' ? transport.map((t) => t.id) : [],
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
      if (err.errors) {
        setFieldErrors(err.errors)
      } else {
        setError(err.detail || 'Не удалось сохранить место.')
      }
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
              <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 6 }}>Закрепление</div>
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
              <PersonalCars selected={selected} onChange={setSelected} />
            ) : (
              <CompanyTransport selected={transport} onChange={setTransport} />
            )}
          </>
        ) : (
          <>
            <Select label="Тип места" required value={placeType} onChange={setPlaceType} error={fieldErrors.place_type}>
              <option value="workplace">Рабочее место</option>
              <option value="storage">Место хранения</option>
            </Select>
            {placeType === 'workplace' ? (
              <WorkplaceEmployees selected={selected} onChange={setSelected} />
            ) : null}
          </>
        )}

        <Checkbox label="Требуется ключ/пропуск" checked={requiresPass} onChange={setRequiresPass} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Button fullWidth loading={submitting} onClick={submit}>
          {isEdit ? 'Сохранить' : 'Создать'}
        </Button>
        <Button variant="secondary" fullWidth onClick={onClose}>
          Отмена
        </Button>
      </div>
    </Modal>
  )
}

// Множественный выбор сотрудников за рабочим местом.
function WorkplaceEmployees({ selected, onChange }) {
  return <EmployeeMulti label="Закреплённые сотрудники" selected={selected} onChange={onChange} />
}

// Владельцы личных авто на парковочном месте (можно несколько).
function PersonalCars({ selected, onChange }) {
  return <EmployeeMulti label="Владельцы личных авто" selected={selected} onChange={onChange} />
}

function EmployeeMulti({ label, selected, onChange }) {
  const selectedIds = new Set(selected.map((e) => e.id))
  const add = (emp) => {
    if (!selectedIds.has(emp.id)) onChange([...selected, { id: emp.id, name: emp.full_name, avatar: emp.avatar || null }])
  }
  const remove = (id) => onChange(selected.filter((e) => e.id !== id))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{label}</div>
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

// Транспорт компании на парковочном месте (можно несколько).
function CompanyTransport({ selected, onChange }) {
  const selectedIds = selected.map((t) => t.id)
  const add = (t) => {
    if (!selectedIds.includes(t.id)) onChange([...selected, t])
  }
  const remove = (id) => onChange(selected.filter((t) => t.id !== id))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Транспорт компании</div>
      {selected.length ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {selected.map((t) => (
            <div
              key={t.id}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 11px', borderRadius: 10, boxShadow: 'inset 0 0 0 1px var(--color-border)' }}
            >
              <Icon name="car" size={16} style={{ color: 'var(--color-text-muted)', flex: 'none' }} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.type_and_model}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--color-text-placeholder)' }}>
                  {[t.plate, `№ ${t.inventory_number}`].filter(Boolean).join(' · ')}
                </div>
              </span>
              <button
                type="button"
                onClick={() => remove(t.id)}
                style={{ border: 'none', background: 'none', color: 'var(--color-text-placeholder)', cursor: 'pointer', padding: 4, flex: 'none' }}
                aria-label="Убрать"
              >
                <Icon name="x" size={16} />
              </button>
            </div>
          ))}
        </div>
      ) : null}
      <TransportPicker onSelect={add} excludeIds={selectedIds} />
    </div>
  )
}
