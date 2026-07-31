import { useEffect, useMemo, useState } from 'react'
import { EmptyState, Icon, Spinner, TypeSelect } from '../../shared/ui'
import { getPlacesReport } from './reportsApi.js'
import {
  BuildingHead, ExpandCard, PlaceBody, ReportShell, RoomHead,
} from './reportsShared.jsx'
import { countLabel } from './reportsUtils.js'

// B45. Отчёт по местам одного типа: рабочие места (workplace), МОП (common),
// места хранения (storage). Данные грузятся целиком; фильтры (здание/помещение/
// место) применяются на клиенте. Пустые места показываются.
const META = {
  workplace: { title: 'Отчёт по рабочим местам', icon: 'briefcase', withEmployees: true },
  common: { title: 'Отчёт по местам общего пользования', icon: 'coffee', withEmployees: false },
  storage: { title: 'Отчёт по местам хранения', icon: 'warehouse', withEmployees: false },
}

export function PlacesReportPage({ kind }) {
  const meta = META[kind]
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [buildingId, setBuildingId] = useState('')
  const [roomId, setRoomId] = useState('')
  const [placeId, setPlaceId] = useState('')

  useEffect(() => {
    setData(null)
    setBuildingId('')
    setRoomId('')
    setPlaceId('')
    getPlacesReport(kind)
      .then((d) => setData(d.buildings || []))
      .catch(() => setError('Не удалось загрузить отчёт.'))
  }, [kind])

  // Опции фильтров из полного набора.
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

  // Отфильтрованное дерево (пустые помещения/здания после фильтра убираем).
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
        icon={meta.icon}
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
    body = <EmptyState icon={<Icon name={meta.icon} size={26} />} title="Ничего не найдено" description="По выбранным фильтрам мест нет." />
  } else {
    body = tree.map((b) => (
      <div key={b.id}>
        <BuildingHead name={b.name} />
        {b.rooms.map((r) => (
          <div key={r.id}>
            <RoomHead name={r.name} floor={r.floor} />
            {r.places.map((p) => {
              const propCount = p.equipment.length + p.tools.length
              const empty = propCount === 0 && !(meta.withEmployees && p.employees?.length)
              return (
                <ExpandCard
                  key={p.id}
                  icon={meta.icon}
                  iconTitle={meta.title}
                  title={p.name}
                  summary={countLabel(propCount, ['объект', 'объекта', 'объектов'])}
                  empty={empty}
                >
                  <PlaceBody
                    employees={p.employees || []}
                    equipment={p.equipment}
                    tools={p.tools}
                    withEmployees={meta.withEmployees}
                  />
                </ExpandCard>
              )
            })}
          </div>
        ))}
      </div>
    ))
  }

  return <ReportShell title={meta.title} filters={filters}>{body}</ReportShell>
}
