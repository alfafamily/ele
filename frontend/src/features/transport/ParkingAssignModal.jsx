import { useEffect, useState } from 'react'
import { Banner, Button, Icon, Modal } from '../../shared/ui'
import { getParkingSpots, setTransportParking } from './transportApi.js'

// Закрепление транспорта за парковкой. Единый список выбора: первым пунктом —
// «На адресе сотрудника» (авто не паркуется на территории), далее — парковочные
// места компании. Место — одно на авто; места с личными авто недоступны.
// Подбор — тем же паттерном, что подбор сотрудника (пикер → выбранное).
const DRIVER = 'driver' // маркер выбора «На адресе сотрудника»

export function ParkingAssignModal({ transport, onClose, onDone }) {
  const current = transport.parking
  const [spots, setSpots] = useState(null)
  const [selected, setSelected] = useState(current?.kind === 'driver_address' ? DRIVER : null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    getParkingSpots()
      .then((data) => {
        setSpots(data)
        if (current?.kind === 'spot') {
          const cur = data.find((s) => s.id === current.place)
          if (cur) setSelected(cur)
        }
      })
      .catch(() => setSpots([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Доступные места: активные парковочные и свободные (одно место — один
  // объект). Текущее место этого транспорта оставляем выбираемым.
  const available = (spots || []).filter(
    (s) => s.id === current?.place || (!s.employees_detail?.length && !s.transport_detail?.length)
  )

  const submit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const payload = selected === DRIVER ? { mode: 'driver_address' } : { mode: 'spot', place: selected.id }
      const saved = await setTransportParking(transport.id, payload)
      onDone(saved)
    } catch (err) {
      setError(err.detail || 'Не удалось сохранить парковку.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Парковка транспорта">
      {error ? <Banner variant="error">{error}</Banner> : null}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, margin: '4px 0 20px' }}>
        {selected ? (
          <SelectedRow selected={selected} onClear={() => setSelected(null)} />
        ) : (
          <SpotPicker
            spots={available}
            loading={spots === null}
            allowDriver={Boolean(transport.employee)}
            onSelect={setSelected}
          />
        )}
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <Button variant="secondary" fullWidth onClick={onClose}>
          Отмена
        </Button>
        <Button fullWidth loading={submitting} disabled={!selected} onClick={submit}>
          Сохранить
        </Button>
      </div>
    </Modal>
  )
}

// Подбор — по образцу EmployeePicker: поле поиска с обводкой + список. Первым
// пунктом всегда «На адресе сотрудника»; далее — парковочные места (клиентский
// поиск, места загружены разом).
function SpotPicker({ spots, loading, allowDriver, onSelect }) {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const visible = q
    ? spots.filter((s) => [s.name, s.room_name, s.building_name].filter(Boolean).some((v) => v.toLowerCase().includes(q)))
    : spots

  return (
    <div>
      <div
        style={{
          height: 40, background: 'var(--color-surface)', boxShadow: 'inset 0 0 0 1px var(--color-primary)',
          borderRadius: 10, display: 'flex', alignItems: 'center', gap: 9, padding: '0 12px',
        }}
      >
        <Icon name="search" size={16} style={{ color: '#757784' }} />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск парковочного места"
          style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 13.5, fontFamily: 'inherit' }}
        />
      </div>
      <div style={{ marginTop: 8, border: '1px solid var(--color-border)', borderRadius: 10, overflow: 'hidden', maxHeight: 250, overflowY: 'auto' }}>
        {/* «На адресе сотрудника» — первым пунктом; доступно только когда за
            транспортом закреплён сотрудник (адрес относится к нему). */}
        {allowDriver ? (
          <PickerRow
            icon="map-pin"
            title="На адресе сотрудника"
            subtitle="Авто не паркуется на территории"
            first
            onClick={() => onSelect(DRIVER)}
          />
        ) : null}
        {loading ? (
          <div style={{ padding: 14, fontSize: 13, textAlign: 'center', color: 'var(--color-text-placeholder)', borderTop: allowDriver ? '1px solid var(--color-border-hairline)' : 'none' }}>Загрузка…</div>
        ) : visible.length === 0 ? (
          <div style={{ padding: 14, fontSize: 13, textAlign: 'center', color: 'var(--color-text-placeholder)', borderTop: allowDriver ? '1px solid var(--color-border-hairline)' : 'none' }}>
            {q ? 'Мест не найдено' : 'Парковочных мест нет'}
          </div>
        ) : (
          visible.map((s, i) => (
            <PickerRow
              key={s.id}
              icon="square-parking"
              title={s.name}
              subtitle={[s.building_name, s.room_name].filter(Boolean).join(' — ')}
              first={i === 0 && !allowDriver}
              onClick={() => onSelect(s)}
            />
          ))
        )}
      </div>
    </div>
  )
}

function PickerRow({ icon, title, subtitle, onClick, first }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', width: '100%',
        border: 'none', borderTop: first ? 'none' : '1px solid var(--color-border-hairline)',
        background: 'transparent', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
      }}
    >
      <span style={{ flex: 'none', width: 30, height: 30, borderRadius: 8, background: 'var(--color-fill-active-tint)', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={17} strokeWidth={2} />
      </span>
      <span style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600 }}>{title}</div>
        {subtitle ? <div style={{ fontSize: 11.5, color: 'var(--color-text-placeholder)' }}>{subtitle}</div> : null}
      </span>
    </button>
  )
}

// Выбранный вариант — свёрнутый вид с крестиком сброса (как SelectedEmployee).
function SelectedRow({ selected, onClear }) {
  const isDriver = selected === DRIVER
  const icon = isDriver ? 'map-pin' : 'square-parking'
  const title = isDriver ? 'На адресе сотрудника' : selected.name
  const subtitle = isDriver
    ? 'Авто не паркуется на территории'
    : [selected.building_name, selected.room_name].filter(Boolean).join(' — ')
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', background: 'var(--color-fill-input)', borderRadius: 10 }}>
      <span style={{ width: 30, height: 30, flex: 'none', borderRadius: 8, background: 'var(--color-fill-active-tint)', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={17} strokeWidth={2} />
      </span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
        <span style={{ display: 'block', fontSize: 11.5, color: 'var(--color-text-placeholder)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subtitle}</span>
      </span>
      <button
        type="button"
        onClick={onClear}
        style={{ border: 'none', background: 'none', color: 'var(--color-text-placeholder)', cursor: 'pointer', padding: 4, flex: 'none' }}
        aria-label="Сбросить"
      >
        <Icon name="x" size={16} />
      </button>
    </div>
  )
}
