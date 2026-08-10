import { Link } from 'react-router-dom'
import { canMaintainTransportType } from '../../shared/permissions.js'
import { csvParam, reqParams } from '../../shared/filterParams.js'
import { ListPage } from '../../shared/ListPage.jsx'
import { Button, Icon, MultiSelectList, RadioPills } from '../../shared/ui'
import { EmployeeNameCell } from '../../shared/EmployeeNameCell.jsx'
import { TruncatedText } from '../../shared/TruncatedText.jsx'
import { Tooltip } from '../../shared/Tooltip.jsx'
import { EmployeeMultiPicker } from '../../shared/EmployeeMultiPicker.jsx'
import { TypeRequisiteFilter } from '../../shared/TypeRequisiteFilter.jsx'
import { maintenanceIndicators } from './statusLabels.js'

const CACHE_KEY = 'transport-list'

const MAINTENANCE_FILTERS = [
  { value: 'overdue', label: 'Дата ТО просрочена' },
  { value: 'due', label: 'Подходит дата ТО' },
  { value: 'unset', label: 'Дата ТО не задана' },
]

const TABS = [
  { value: 'active', label: 'Активный' },
  { value: 'archive', label: 'Списанный' },
]
const ASSIGNED_OPTIONS = [
  { value: 'none', label: 'Не важно' },
  { value: 'employee', label: 'За сотрудником' },
  { value: 'free', label: 'Свободный' },
]

const EMPTY_FILTERS = {
  toDates: [],
  types: [],
  req: {},
  assignedMode: 'none',
  employees: [],
}

const toggle = (arr, v) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v])

function countActive(f) {
  return (
    (f.toDates.length ? 1 : 0) +
    (f.types.length ? 1 : 0) +
    Object.keys(f.req).length +
    (f.assignedMode !== 'none' ? 1 : 0)
  )
}

const ACTIVE_COLUMNS = [
  { key: 'transport_type__name', label: 'Наименование', sortable: true, width: 'minmax(0, 1.3fr)' },
  { key: 'employee__last_name', label: 'Сотрудник', sortable: true, width: 'minmax(0, 1fr)' },
  { key: 'chevron', label: '', width: '30px' },
]
const ARCHIVE_COLUMNS = [
  { key: 'transport_type__name', label: 'Наименование', width: 'minmax(0, 1.3fr)' },
  { key: 'written_off_at', label: 'Дата списания', width: '170px' },
  { key: 'chevron', label: '', width: '30px' },
]

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('ru-RU')
}

function transportFilter(draft, setDraft, perms) {
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }))
  return {
    main: (
      <>
        {perms.canSeeTransportMaintenance ? (
          <div>
            <div className="ele-filter-section__title">Техобслуживание</div>
            <MultiSelectList
              options={MAINTENANCE_FILTERS}
              selected={draft.toDates}
              onToggle={(v) => set({ toDates: toggle(draft.toDates, v) })}
            />
          </div>
        ) : null}
        <TypeRequisiteFilter
          endpoint="/api/transport-types/"
          valuesBase="/api/transport/field-values/"
          label="Вид транспорта"
          types={draft.types}
          onTypesChange={(t) => set({ types: t })}
          req={draft.req}
          onReqChange={(r) => set({ req: r })}
        />
      </>
    ),
    aside: (
      <div>
        <div className="ele-filter-section__title">Закреплён за</div>
        <RadioPills options={ASSIGNED_OPTIONS} value={draft.assignedMode} onChange={(v) => set({ assignedMode: v })} />
        {draft.assignedMode === 'employee' ? (
          <div style={{ marginTop: 10 }}>
            <EmployeeMultiPicker value={draft.employees} onChange={(e) => set({ employees: e })} />
          </div>
        ) : null}
      </div>
    ),
  }
}

function transportRow(row, { tab, perms }) {
  // ТО транспорта включено всегда → индикаторы показываем всем, кто причастен к
  // ТО этого типа (или Наблюдателю).
  const showTo =
    canMaintainTransportType(perms, row.transport_type) ||
    perms.canManageTransportMaintenance ||
    perms.isObserver
  return (
    <>
      <div style={{ minWidth: 0 }}>
        {/* Иконки статуса ТО — инлайново в начале наименования: сидят на первой
            строке, а перенос названия уходит под них (не расширяют строку по
            высоте). Длинное название — максимум 2 строки, дальше многоточие. */}
        <TruncatedText singleLine={false} className="ele-clamp-2" style={{ fontWeight: 500, lineHeight: 1.3 }} text={row.type_and_model}>
          {(showTo ? maintenanceIndicators(row.maintenance_summary) : []).map((ind, i) => (
            <Tooltip
              key={i}
              label={ind.title}
              style={{ verticalAlign: '-0.15em', marginRight: 4, color: ind.color }}
            >
              <Icon name={ind.icon} size={14} strokeWidth={2} />
            </Tooltip>
          ))}
          {row.type_and_model}
        </TruncatedText>
        <div style={{ display: 'flex', gap: 10, marginTop: 2, flexWrap: 'wrap' }}>
          {row.plate ? (
            <span style={{ font: '600 12px var(--font-mono)', color: 'var(--color-text-secondary)' }}>{row.plate}</span>
          ) : null}
          <span style={{ font: '500 12px var(--font-mono)', color: 'var(--color-text-placeholder)' }}>{row.inventory_number}</span>
        </div>
      </div>
      {tab === 'active' ? (
        <div style={{ minWidth: 0 }}>
          {row.employee_name ? (
            <EmployeeNameCell name={row.employee_name} position={row.position} department={row.department} status={row.acceptance_status} />
          ) : (
            <span style={{ color: 'var(--color-text-placeholder)' }}>Свободный</span>
          )}
        </div>
      ) : (
        <div style={{ color: 'var(--color-text-placeholder)', font: '500 13px var(--font-mono)' }}>
          {formatDate(row.written_off_at)}
        </div>
      )}
    </>
  )
}

export function TransportListPage() {
  return (
    <ListPage
      title="Транспорт"
      headerPerm="canManageTransport"
      headerActions={
        <>
          <Link to="/transport-types">
            <Button variant="secondary" title="Настроить виды" aria-label="Настроить виды">
              <span className="ele-only-desktop">Настроить виды</span>
              <Icon className="ele-only-mobile" name="columns-3-cog" size={20} strokeWidth={1.9} />
            </Button>
          </Link>
          <Link to="/transport/new">
            <Button title="Добавить транспорт" aria-label="Добавить транспорт">
              <Icon className="ele-only-desktop" name="plus" size={18} strokeWidth={2.2} />
              <span className="ele-only-desktop">Добавить транспорт</span>
              <Icon className="ele-only-mobile" name="plus" size={22} strokeWidth={2.4} />
            </Button>
          </Link>
        </>
      }
      cacheKey={CACHE_KEY}
      endpoint="/api/transport/"
      tabs={TABS}
      emptyFilters={EMPTY_FILTERS}
      filterCount={countActive}
      renderFilter={({ draft, setDraft, perms }) => transportFilter(draft, setDraft, perms)}
      buildParams={({ tab, isActive, filters, search, ordering }) => ({
        tab,
        to_due: isActive && filters.toDates.includes('due') ? '1' : undefined,
        to_overdue: isActive && filters.toDates.includes('overdue') ? '1' : undefined,
        to_unset: isActive && filters.toDates.includes('unset') ? '1' : undefined,
        type: isActive ? csvParam(filters.types) : undefined,
        ...(isActive ? reqParams(filters.req) : {}),
        assigned: isActive && filters.assignedMode !== 'none' ? filters.assignedMode : undefined,
        employee: isActive && filters.assignedMode === 'employee' ? csvParam(filters.employees.map((e) => e.id)) : undefined,
        search: search || undefined,
        ordering,
      })}
      activeColumns={ACTIVE_COLUMNS}
      archiveColumns={ARCHIVE_COLUMNS}
      renderRow={transportRow}
      rowLink={(row) => `/transport/${row.id}`}
      emptyText={({ search, tab }) => ({
        title: search ? 'Ничего не найдено' : tab === 'archive' ? 'Списанного нет' : 'Пока пусто',
        description: search
          ? `По запросу «${search}» транспорт не найден. Попробуйте изменить запрос или сбросить фильтры.`
          : tab === 'archive'
            ? 'Списанный транспорт будет отображаться здесь.'
            : 'Когда вы добавите транспорт, он будет отображаться здесь.',
        resetLabel: 'Сбросить фильтры',
      })}
    />
  )
}
