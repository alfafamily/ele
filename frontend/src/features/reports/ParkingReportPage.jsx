import { useEffect, useMemo, useState } from 'react'
import { EmptyState, Icon, Spinner, TypeSelect } from '../../shared/ui'
import { getParkingReport } from './reportsApi.js'
import { BuildingHead, ExpandCard, ReportTwoStage, RoomHead } from './reportsShared.jsx'
// countLabel не нужен здесь — сводка парковок текстовая.

// B45. Отчёт по парковкам: парковочные места с увязкой к зданию/помещению; за
// каждым — сотрудник (личное авто) или транспорт компании. Фильтры: здание,
// помещение (только парковки), место. Пустые места показываются.
export function ParkingReportPage() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [buildingId, setBuildingId] = useState('')
  const [roomId, setRoomId] = useState('')
  const [placeId, setPlaceId] = useState('')

  useEffect(() => {
    getParkingReport()
      .then((d) => setData(d.buildings || []))
      .catch(() => setError('Не удалось загрузить отчёт.'))
  }, [])

  const buildings = useMemo(() => data || [], [data])
  const roomOptions = useMemo(() => {
    const src = buildingId ? buildings.filter((b) => String(b.id) === buildingId) : buildings
    return src.flatMap((b) => b.rooms.map((r) => ({ id: r.id, name: r.name })))
  }, [buildings, buildingId])
  const placeOptions = useMemo(() => {
    const rooms = buildings.flatMap((b) => b.rooms)
    const src = roomId ? rooms.filter((r) => String(r.id) === roomId) : rooms
    return src.flatMap((r) => r.places.map((p) => ({ id: p.id, name: p.name })))
  }, [buildings, roomId])

  const tree = useMemo(() => {
    return buildings
      .filter((b) => !buildingId || String(b.id) === buildingId)
      .map((b) => ({
        ...b,
        rooms: b.rooms
          .filter((r) => !roomId || String(r.id) === roomId)
          .map((r) => ({ ...r, places: r.places.filter((p) => !placeId || String(p.id) === placeId) }))
          .filter((r) => r.places.length),
      }))
      .filter((b) => b.rooms.length)
  }, [buildings, buildingId, roomId, placeId])

  const filters = (
    <div className="ele-report-place-filters">
      <TypeSelect
        label="Здание"
        icon="building-2"
        emptyText="Зданий нет"
        options={buildings.map((b) => ({ id: b.id, name: b.name }))}
        value={buildingId}
        onChange={(v) => { setBuildingId(v); setRoomId(''); setPlaceId('') }}
      />
      <TypeSelect
        label="Помещение"
        icon="map-pin"
        emptyText="Помещений нет"
        options={roomOptions}
        value={roomId}
        onChange={(v) => { setRoomId(v); setPlaceId('') }}
      />
      <TypeSelect
        label="Место"
        icon="square-parking"
        emptyText="Мест нет"
        options={placeOptions}
        value={placeId}
        onChange={setPlaceId}
      />
    </div>
  )

  let body
  if (error) body = <EmptyState title={error} />
  else if (data === null) body = <div style={{ display: 'flex', justifyContent: 'center', padding: 50 }}><Spinner /></div>
  else if (!tree.length) {
    body = <EmptyState icon={<Icon name="square-parking" size={26} />} title="Ничего не найдено" description="По выбранным фильтрам парковочных мест нет." />
  } else {
    body = tree.map((b) => (
      <div key={b.id}>
        <BuildingHead name={b.name} />
        {b.rooms.map((r) => (
          <div key={r.id}>
            <RoomHead name={r.name} floor={r.floor} />
            {r.places.map((p) => {
              const emp = p.employees?.[0]
              const tr = p.transport?.[0]
              const empty = !emp && !tr
              return (
                <ExpandCard
                  key={p.id}
                  icon="square-parking"
                  iconTitle="Парковочное место"
                  title={p.name}
                  summary={emp ? 'личный авто' : tr ? 'транспорт компании' : ''}
                  empty={empty}
                >
                  {emp ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 13.5 }}>
                      <Icon name="user" size={14} strokeWidth={2} style={{ color: 'var(--color-text-muted)' }} />
                      <span>{emp.name}{emp.position ? <span style={{ color: 'var(--color-text-placeholder)' }}> · {emp.position}</span> : null}<span style={{ color: 'var(--color-text-placeholder)' }}> · личный авто</span></span>
                    </div>
                  ) : null}
                  {tr ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 13.5 }}>
                      <Icon name="car" size={14} strokeWidth={2} style={{ color: 'var(--color-text-muted)' }} />
                      <span>{tr.type_and_model} <span style={{ color: 'var(--color-text-placeholder)' }}>{[tr.plate, `№ ${tr.inventory_number}`].filter(Boolean).join(' · ')}</span></span>
                    </div>
                  ) : null}
                  {empty ? <div style={{ fontSize: 13, color: 'var(--color-text-placeholder)', padding: '4px 0' }}>Место свободно.</div> : null}
                </ExpandCard>
              )
            })}
          </div>
        ))}
      </div>
    ))
  }

  return (
    <ReportTwoStage
      title="Отчёт по парковкам"
      filterTitle="Здание, помещение, место"
      filterHint="Выберите или оставьте пустым — отчёт по всем."
      filters={filters}
    >
      {body}
    </ReportTwoStage>
  )
}
