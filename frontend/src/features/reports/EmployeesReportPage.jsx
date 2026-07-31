import { useEffect, useMemo, useState } from 'react'
import { EmptyState, Icon, MultiSelectList, Spinner } from '../../shared/ui'
import { getEmployeesReport } from './reportsApi.js'
import {
  AcceptanceLegend, EmployeePropertyBlock, ExpandCard, ReportTwoStage, SectionHead, WorkplaceBlock,
} from './reportsShared.jsx'
import { countLabel } from './reportsUtils.js'

// B45. Отчёт по имуществу у сотрудников: закреплённое имущество (с иконкой
// статуса акцепта B32) + рабочие места сотрудника с имуществом на них. Подбор
// сотрудников — поиском+списком (как в модалках закрепления); не выбран никто —
// отчёт по всем.
export function EmployeesReportPage() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [selectedIds, setSelectedIds] = useState([])

  useEffect(() => {
    getEmployeesReport()
      .then((d) => setData(d.employees || []))
      .catch(() => setError('Не удалось загрузить отчёт.'))
  }, [])

  const employees = useMemo(() => data || [], [data])
  const options = useMemo(
    () => employees.map((e) => ({ value: String(e.id), label: e.name, sub: [e.position, e.department].filter(Boolean).join(' · ') })),
    [employees],
  )
  const list = useMemo(
    () => (selectedIds.length ? employees.filter((e) => selectedIds.includes(String(e.id))) : employees),
    [employees, selectedIds],
  )
  const toggle = (v) => setSelectedIds((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]))

  const filters = (
    <MultiSelectList
      options={options}
      selected={selectedIds}
      onToggle={toggle}
      search
      chips
      loading={data === null}
      emptyText="Сотрудников нет"
    />
  )

  let body
  if (error) body = <EmptyState title={error} />
  else if (data === null) body = <div style={{ display: 'flex', justifyContent: 'center', padding: 50 }}><Spinner /></div>
  else if (!list.length) {
    body = <EmptyState icon={<Icon name="users" size={26} />} title="Сотрудников нет" />
  } else {
    body = list.map((e) => {
      const directCount = e.equipment.length + e.tools.length + e.sim.length + e.passes.length + e.transport.length
      const total = directCount + e.workplaces.reduce((a, w) => a + w.equipment.length + w.tools.length, 0)
      const subtitle = [e.position, e.department].filter(Boolean).join(' · ')
      return (
        <ExpandCard
          key={e.id}
          icon="circle-user"
          title={e.name}
          subtitle={subtitle}
          summary={countLabel(total, ['объект', 'объекта', 'объектов'])}
          empty={total === 0}
        >
          <SectionHead first>Закреплённое имущество</SectionHead>
          <EmployeePropertyBlock emp={e} />
          {e.workplaces.length ? (
            <>
              <SectionHead>Рабочие места</SectionHead>
              <WorkplaceBlock workplaces={e.workplaces} />
            </>
          ) : null}
        </ExpandCard>
      )
    })
  }

  return (
    <ReportTwoStage
      title="Отчёт по имуществу у сотрудников"
      filterTitle="Сотрудники"
      filterHint="Выберите сотрудников или оставьте пустым — отчёт по всем."
      filters={filters}
    >
      <div style={{ marginBottom: 14 }}>
        <AcceptanceLegend />
      </div>
      {body}
    </ReportTwoStage>
  )
}
