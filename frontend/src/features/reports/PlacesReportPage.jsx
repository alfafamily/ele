import { useEffect, useMemo, useState } from 'react'
import { EmptyState, Icon, Select, Spinner } from '../../shared/ui'
import { getPlacesReport } from './reportsApi.js'
import {
  BuildingHead, EmployeeChips, ExpandCard, FilterRow, PropertyBlock, ReportShell, RoomHead,
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
    <FilterRow>
      <Select label="Здание" placeholder="Все" value={buildingId} onChange={(v) => { setBuildingId(v); setRoomId(''); setPlaceId('') }} className="ele-report-filter">
        {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
      </Select>
      <Select label="Помещение" placeholder="Все" value={roomId} onChange={(v) => { setRoomId(v); setPlaceId('') }} className="ele-report-filter">
        {roomOptions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
      </Select>
      <Select label="Место" placeholder="Все" value={placeId} onChange={setPlaceId} className="ele-report-filter">
        {placeOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </Select>
    </FilterRow>
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
                  {meta.withEmployees ? <EmployeeChips employees={p.employees || []} /> : null}
                  <PropertyBlock equipment={p.equipment} tools={p.tools} />
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
