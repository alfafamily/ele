import { useEffect, useMemo, useState } from 'react'
import { EmptyState, Icon, Spinner } from '../../shared/ui'
import { getParkingReport } from './reportsApi.js'
import { BuildingHead, ExpandCard, LocationFilters, ReportTwoStage, RoomHead } from './reportsShared.jsx'
import { useLocationFilter } from './useLocationFilter.js'
// countLabel не нужен здесь — сводка парковок текстовая.

// B45. Отчёт по парковкам: парковочные места с увязкой к зданию/помещению; за
// каждым — сотрудник (личное авто) или транспорт компании. Фильтры: здание,
// помещение (только парковки), место. Пустые места показываются.
export function ParkingReportPage() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    getParkingReport()
      .then((d) => setData(d.buildings || []))
      .catch(() => setError('Не удалось загрузить отчёт.'))
  }, [])

  const buildings = useMemo(() => data || [], [data])
  const loc = useLocationFilter(buildings)
  const tree = loc.tree

  const filters = <LocationFilters buildings={buildings} state={loc} />

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
