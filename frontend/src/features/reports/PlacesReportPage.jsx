import { useEffect, useMemo, useState } from 'react'
import { EmptyState, Icon, Spinner } from '../../shared/ui'
import { getPlacesReport } from './reportsApi.js'
import {
  BuildingHead, ExpandCard, LocationFilters, PlaceBody, ReportTwoStage, RoomHead,
} from './reportsShared.jsx'
import { useLocationFilter } from './useLocationFilter.js'
import { countLabel } from './reportsUtils.js'

// B45. Отчёт по местам одного типа: рабочие места (workplace), МОП (common),
// места хранения (storage). Данные грузятся целиком; фильтры (здание/помещение/
// место) применяются на клиенте. Пустые места показываются.
const META = {
  workplace: { title: 'Отчёт по рабочим местам', icon: 'monitor', withEmployees: true },
  common: { title: 'Отчёт по местам общего пользования', icon: 'coffee', withEmployees: false },
  storage: { title: 'Отчёт по местам хранения', icon: 'warehouse', withEmployees: false },
}

export function PlacesReportPage({ kind }) {
  const meta = META[kind]
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    setData(null)
    getPlacesReport(kind)
      .then((d) => setData(d.buildings || []))
      .catch(() => setError('Не удалось загрузить отчёт.'))
  }, [kind])

  const buildings = useMemo(() => data || [], [data])
  const loc = useLocationFilter(buildings)
  const tree = loc.tree

  const filters = <LocationFilters buildings={buildings} state={loc} />

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
              const propCount = p.equipment.length + p.tools.length + (p.sim?.length || 0) + (p.licenses?.length || 0)
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
                    sim={p.sim || []}
                    licenses={p.licenses || []}
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

  return (
    <ReportTwoStage
      title={meta.title}
      filterTitle="Здание, помещение, место"
      filterHint="Выберите или оставьте пустым — отчёт по всем."
      filters={filters}
    >
      {body}
    </ReportTwoStage>
  )
}
