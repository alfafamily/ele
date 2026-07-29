import { useEffect, useMemo, useState } from 'react'
import { EmptyState, Icon, Select, Spinner } from '../../shared/ui'
import { getEmployeesReport } from './reportsApi.js'
import {
  AcceptanceLegend, EmployeePropertyBlock, ExpandCard, FilterRow, PropertyBlock, ReportShell, SectionHead,
} from './reportsShared.jsx'
import { countLabel } from './reportsUtils.js'

// B45. Отчёт по имуществу у сотрудников: закреплённое имущество (с иконкой
// статуса акцепта B32) + рабочие места сотрудника с имуществом на них. Фильтр —
// по сотруднику. Показываются все сотрудники (в т.ч. без имущества).
export function EmployeesReportPage() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [employeeId, setEmployeeId] = useState('')

  useEffect(() => {
    getEmployeesReport()
      .then((d) => setData(d.employees || []))
      .catch(() => setError('Не удалось загрузить отчёт.'))
  }, [])

  const employees = useMemo(() => data || [], [data])
  const list = useMemo(
    () => (employeeId ? employees.filter((e) => String(e.id) === employeeId) : employees),
    [employees, employeeId],
  )

  const filters = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <FilterRow>
        <Select label="Сотрудник" placeholder="Все" value={employeeId} onChange={setEmployeeId} className="ele-report-filter">
          {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </Select>
      </FilterRow>
      <AcceptanceLegend />
    </div>
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {e.workplaces.map((w) => (
                  <div key={w.id} style={{ background: 'var(--color-fill-input)', borderRadius: 10, padding: '10px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, fontWeight: 600, marginBottom: 2 }}>
                      <Icon name="briefcase" size={14} strokeWidth={2} style={{ color: 'var(--color-text-muted)', flex: 'none' }} />
                      {w.name}
                      <span style={{ fontWeight: 400, color: 'var(--color-text-placeholder)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>· {w.building_name} — {w.room_name}</span>
                    </div>
                    <PropertyBlock equipment={w.equipment} tools={w.tools} />
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </ExpandCard>
      )
    })
  }

  return <ReportShell title="Отчёт по имуществу у сотрудников" filters={filters}>{body}</ReportShell>
}
