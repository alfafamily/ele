import { Link } from 'react-router-dom'
import { canMaintainType } from '../../shared/permissions.js'
import { csvParam, reqParams } from '../../shared/filterParams.js'
import { ListPage } from '../../shared/ListPage.jsx'
import { Button, Icon, MultiSelectList, RadioPills } from '../../shared/ui'
import { EmployeeNameCell } from '../../shared/EmployeeNameCell.jsx'
import { TruncatedText } from '../../shared/TruncatedText.jsx'
import { Tooltip } from '../../shared/Tooltip.jsx'
import { EmployeeMultiPicker } from '../../shared/EmployeeMultiPicker.jsx'
import { RemoteMultiSelect } from '../../shared/RemoteMultiSelect.jsx'
import { TypeRequisiteFilter } from '../../shared/TypeRequisiteFilter.jsx'
import { maintenanceRowIndicators } from './statusLabels.js'
import { PlacementIcon } from '../../shared/PlacementIcon.jsx'

const CACHE_KEY = 'equipment-list'

// B13+. Мультивыбор-фильтры по статусу ТО (можно несколько сразу).
const MAINTENANCE_FILTERS = [
  { value: 'overdue', label: 'Дата ТО просрочена' },
  { value: 'due', label: 'Подходит дата ТО' },
  { value: 'unset', label: 'Дата ТО не задана' },
]

const TABS = [
  { value: 'active', label: 'Активное' },
  { value: 'archive', label: 'Списанное' },
]
// B27. «Закреплён за» — категория (radio) + мультивыбор значений выбранной.
const ASSIGNED_OPTIONS = [
  { value: 'none', label: 'Не важно' },
  { value: 'employee', label: 'Сотрудник' },
  { value: 'storage', label: 'Место хранения' },
  { value: 'workplace', label: 'Рабочее место' },
]

const EMPTY_FILTERS = {
  toDates: [],
  types: [],
  req: {},
  assignedMode: 'none',
  employees: [],
  storagePlaces: [],
  workplaces: [],
}

const placeOption = (p) => ({ value: String(p.id), label: p.name, sub: `${p.building_name} — ${p.room_name}` })
const toggle = (arr, v) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v])

// Число активных фильтров для бейджа/подписи «Сбросить».
function countActive(f) {
  return (
    (f.toDates.length ? 1 : 0) +
    (f.types.length ? 1 : 0) +
    Object.keys(f.req).length +
    (f.assignedMode !== 'none' ? 1 : 0)
  )
}

const ACTIVE_COLUMNS = [
  { key: 'equipment_type__name', label: 'Наименование', sortable: true, width: 'minmax(0, 1.3fr)' },
  { key: 'employee__last_name', label: 'Сотрудник/Место', sortable: true, width: 'minmax(0, 1fr)' },
  { key: 'chevron', label: '', width: '30px' },
]
const ARCHIVE_COLUMNS = [
  { key: 'equipment_type__name', label: 'Наименование', width: 'minmax(0, 1.3fr)' },
  { key: 'written_off_at', label: 'Дата списания', width: '170px' },
  { key: 'chevron', label: '', width: '30px' },
]

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('ru-RU')
}

function equipmentFilter(draft, setDraft, perms) {
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }))
  return {
    main: (
      <>
        {perms.canSeeMaintenance ? (
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
          endpoint="/api/equipment-types/"
          valuesBase="/api/equipment/field-values/"
          label="Вид оборудования"
          types={draft.types}
          onTypesChange={(t) => set({ types: t })}
          req={draft.req}
          onReqChange={(r) => set({ req: r })}
        />
      </>
    ),
    aside: (
      <div>
        <div className="ele-filter-section__title">Размещение</div>
        <RadioPills options={ASSIGNED_OPTIONS} value={draft.assignedMode} onChange={(v) => set({ assignedMode: v })} />
        {draft.assignedMode === 'employee' ? (
          <div style={{ marginTop: 10 }}>
            <EmployeeMultiPicker value={draft.employees} onChange={(e) => set({ employees: e })} extraParams={draft.types.length ? { has_equipment_type: draft.types.join(',') } : undefined} />
          </div>
        ) : null}
        {draft.assignedMode === 'storage' ? (
          <div style={{ marginTop: 10 }}>
            <RemoteMultiSelect
              endpoint={`/api/places/?place_type=storage&active=1${draft.types.length ? `&has_equipment_type=${draft.types.join(',')}` : ''}`}
              mapOption={placeOption}
              selected={draft.storagePlaces}
              onChange={(p) => set({ storagePlaces: p })}
            />
          </div>
        ) : null}
        {draft.assignedMode === 'workplace' ? (
          <div style={{ marginTop: 10 }}>
            <RemoteMultiSelect
              endpoint={`/api/places/?place_type=workplace&active=1${draft.types.length ? `&has_equipment_type=${draft.types.join(',')}` : ''}`}
              mapOption={placeOption}
              selected={draft.workplaces}
              onChange={(p) => set({ workplaces: p })}
            />
          </div>
        ) : null}
      </div>
    ),
  }
}

function equipmentRow(row, { tab, perms }) {
  return (
    <>
      {/* Наименование (Тип+Модель) в 2 строки + учётный номер ниже.
          B13: пара иконок статуса ТО (гаечный ключ + часы). */}
      <div style={{ minWidth: 0 }}>
        {/* Иконки статуса ТО — инлайново в начале наименования: сидят на первой
            строке, перенос названия уходит под них. Длинное название — максимум
            2 строки, дальше многоточие (ele-clamp-2). */}
        <TruncatedText singleLine={false} className="ele-clamp-2" style={{ fontWeight: 500, lineHeight: 1.3 }} text={row.type_and_model}>
          {/* B23: цветные статусы проведения ТО — только для типов, по которым
              пользователь проводит ТО (в своей области) или для Наблюдателя;
              серый «нет даты» — дополнительно для тех, кто управляет
              регламентами (задать дату — их зона). */}
          {maintenanceRowIndicators(row.maintenance_summary, {
            fullStatus: canMaintainType(perms, row.equipment_type) || perms.isObserver,
            manageOnly: perms.canManageMaintenance,
          }).map((ind, i) => (
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
        <div style={{ font: '500 12px var(--font-mono)', color: 'var(--color-text-placeholder)', marginTop: 2 }}>{row.inventory_number}</div>
      </div>
      {tab === 'active' ? (
        // Размещение: сотрудник (ФИО + отдел) / рабочее место / склад
        <div style={{ minWidth: 0 }}>
          {row.employee_name ? (
            <EmployeeNameCell name={row.employee_name} position={row.position} department={row.department} status={row.acceptance_status} />
          ) : row.place_detail ? (
            <>
              <TruncatedText singleLine={false} className="ele-clamp-2">
                <PlacementIcon placeType={row.place_detail.place_type} />{row.place_detail.name}
              </TruncatedText>
              <TruncatedText style={{ color: 'var(--color-text-placeholder)', fontSize: 12.5, marginTop: 2 }}>
                {row.place_detail.building_name} — {row.place_detail.room_name}
              </TruncatedText>
            </>
          ) : (
            <div className="ele-clamp-2"><PlacementIcon placeType="storage" />Без склада</div>
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

export function EquipmentListPage() {
  return (
    <ListPage
      title="Оборудование"
      headerPerm="canManageEquipment"
      headerActions={
        <>
          <Link to="/equipment-types">
            <Button variant="secondary" title="Настроить виды" aria-label="Настроить виды">
              <span className="ele-only-desktop">Настроить виды</span>
              <Icon className="ele-only-mobile" name="columns-3-cog" size={20} strokeWidth={1.9} />
            </Button>
          </Link>
          <Link to="/equipment/new">
            <Button title="Добавить оборудование" aria-label="Добавить оборудование">
              <Icon className="ele-only-desktop" name="plus" size={18} strokeWidth={2.2} />
              <span className="ele-only-desktop">Добавить оборудование</span>
              <Icon className="ele-only-mobile" name="plus" size={22} strokeWidth={2.4} />
            </Button>
          </Link>
        </>
      }
      cacheKey={CACHE_KEY}
      endpoint="/api/equipment/"
      tabs={TABS}
      emptyFilters={EMPTY_FILTERS}
      filterCount={countActive}
      renderFilter={({ draft, setDraft, perms }) => equipmentFilter(draft, setDraft, perms)}
      buildParams={({ tab, isActive, filters, search, ordering }) => ({
        tab,
        to_due: isActive && filters.toDates.includes('due') ? '1' : undefined,
        to_overdue: isActive && filters.toDates.includes('overdue') ? '1' : undefined,
        to_unset: isActive && filters.toDates.includes('unset') ? '1' : undefined,
        type: isActive ? csvParam(filters.types) : undefined,
        ...(isActive ? reqParams(filters.req) : {}),
        assigned: isActive && filters.assignedMode !== 'none' ? filters.assignedMode : undefined,
        employee: isActive && filters.assignedMode === 'employee' ? csvParam(filters.employees.map((e) => e.id)) : undefined,
        place_storage: isActive && filters.assignedMode === 'storage' ? csvParam(filters.storagePlaces) : undefined,
        place_workplace: isActive && filters.assignedMode === 'workplace' ? csvParam(filters.workplaces) : undefined,
        search: search || undefined,
        ordering,
      })}
      activeColumns={ACTIVE_COLUMNS}
      archiveColumns={ARCHIVE_COLUMNS}
      renderRow={equipmentRow}
      rowLink={(row) => `/equipment/${row.id}`}
      emptyText={({ search, tab }) => ({
        title: search ? 'Ничего не найдено' : tab === 'archive' ? 'Списанного нет' : 'Пока пусто',
        description: search
          ? `По запросу «${search}» оборудование не найдено. Попробуйте изменить запрос или сбросить фильтры.`
          : tab === 'archive'
            ? 'Списанное оборудование будет отображаться здесь.'
            : 'Когда вы добавите оборудование, оно будет отображаться здесь.',
        resetLabel: 'Сбросить фильтры',
      })}
    />
  )
}
