import { useEffect, useMemo, useState } from 'react'
import { Banner, Button, Icon, Modal, RadioPills, SearchInput } from '../../shared/ui'
import { getParkingSpots, setTransportParking } from './transportApi.js'

// Закрепление транспорта за парковкой: парковочное место компании ЛИБО «на
// адресе водителя» (авто не паркуется на территории). Место — одно на авто:
// места, где уже стоят личные авто, для выбора недоступны (взаимоисключение).
export function ParkingAssignModal({ transport, onClose, onDone }) {
  const current = transport.parking
  const [mode, setMode] = useState(current?.kind === 'driver_address' ? 'driver_address' : 'spot')
  const [spots, setSpots] = useState(null)
  const [selectedId, setSelectedId] = useState(current?.kind === 'spot' ? current.place : null)
  const [search, setSearch] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    getParkingSpots().then(setSpots).catch(() => setSpots([]))
  }, [])

  // Доступные места: активные парковочные, без закреплённых личных авто (кроме
  // тех, где уже стоит этот транспорт — их оставляем видимыми).
  const available = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (spots || [])
      .filter((s) => !s.employees_detail?.length || s.id === current?.place)
      .filter((s) => {
        if (!q) return true
        return [s.name, s.room_name, s.building_name].filter(Boolean).some((v) => v.toLowerCase().includes(q))
      })
  }, [spots, search, current])

  const submit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const payload = mode === 'driver_address' ? { mode: 'driver_address' } : { mode: 'spot', place: selectedId }
      const saved = await setTransportParking(transport.id, payload)
      onDone(saved)
    } catch (err) {
      setError(err.detail || 'Не удалось сохранить парковку.')
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmit = mode === 'driver_address' || Boolean(selectedId)

  return (
    <Modal open onClose={onClose} title="Парковка транспорта">
      {error ? <Banner variant="error">{error}</Banner> : null}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, margin: '4px 0 20px' }}>
        <RadioPills
          value={mode}
          onChange={setMode}
          options={[
            { value: 'spot', label: 'Парковочное место' },
            { value: 'driver_address', label: 'На адресе водителя' },
          ]}
        />

        {mode === 'driver_address' ? (
          <div style={{ fontSize: 13.5, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
            Авто не паркуется на территории компании — паркуется по адресу водителя.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <SearchInput value={search} onChange={setSearch} placeholder="Поиск парковочного места" />
            {spots === null ? (
              <div style={{ fontSize: 13, color: 'var(--color-text-placeholder)', padding: 12, textAlign: 'center' }}>Загрузка…</div>
            ) : available.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--color-text-placeholder)', padding: 12, textAlign: 'center' }}>
                Нет доступных парковочных мест.
              </div>
            ) : (
              <div style={{ border: '1px solid var(--color-border)', borderRadius: 10, overflow: 'hidden', maxHeight: 260, overflowY: 'auto' }}>
                {available.map((s, i) => {
                  const active = s.id === selectedId
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSelectedId(s.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', width: '100%',
                        border: 'none', borderTop: i === 0 ? 'none' : '1px solid var(--color-border-hairline)',
                        background: active ? 'var(--color-fill-active-tint)' : 'transparent',
                        cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                      }}
                    >
                      <Icon name="square-parking" size={17} strokeWidth={2} style={{ color: 'var(--color-text-muted)', flex: 'none' }} />
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 600 }}>{s.name}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--color-text-placeholder)' }}>
                          {[s.building_name, s.room_name].filter(Boolean).join(' — ')}
                        </div>
                      </span>
                      {active ? <Icon name="check" size={16} strokeWidth={2.4} style={{ color: 'var(--color-primary)', flex: 'none' }} /> : null}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Button fullWidth loading={submitting} disabled={!canSubmit} onClick={submit}>
          Сохранить
        </Button>
        <Button variant="secondary" fullWidth onClick={onClose}>
          Отмена
        </Button>
      </div>
    </Modal>
  )
}
