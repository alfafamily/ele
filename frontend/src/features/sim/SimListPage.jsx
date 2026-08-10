import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { csvParam } from '../../shared/filterParams.js'
import { apiGet } from '../../shared/api/client'
import { ListPage } from '../../shared/ListPage.jsx'
import { Button, Checkbox, Icon, RadioPills } from '../../shared/ui'
import { EmployeeNameCell } from '../../shared/EmployeeNameCell.jsx'
import { TruncatedText } from '../../shared/TruncatedText.jsx'
import { PlacementIcon } from '../../shared/PlacementIcon.jsx'
import { EmployeeMultiPicker } from '../../shared/EmployeeMultiPicker.jsx'
import { RemoteMultiSelect } from '../../shared/RemoteMultiSelect.jsx'

const CACHE_KEY = 'sim-list'

const TABS = [
  { value: 'active', label: 'Активные' },
  { value: 'utilized', label: 'Утилизированные' },
]
const SIM_TYPE_FILTERS = [
  { value: 'all', label: 'Все' },
  { value: 'sim', label: 'SIM' },
  { value: 'esim', label: 'E-SIM' },
]
// B27. «Размещение» — сотрудник / место хранения. Непривязанные E-SIM (нигде не
// хранятся) ищутся спец-пунктом «У оператора» в списке мест (см. UNATTACHED).
const ASSIGNED_OPTIONS = [
  { value: 'none', label: 'Не важно' },
  { value: 'employee', label: 'Сотрудник' },
  { value: 'storage', label: 'Место хранения' },
]
// Синтетическое значение «У оператора» в списке мест хранения (непривязанные E-SIM).
const UNATTACHED = '__unattached__'

const placeOption = (p) => ({ value: String(p.id), label: p.name, sub: `${p.building_name} — ${p.room_name}` })
const strOption = (s) => ({ value: s, label: s })

// Верхние SIM-фильтры (тип/оператор/поставщик) → параметры ограничения опций
// сотрудников/мест хранения (has_sim) + строка запроса для эндпоинта мест.
function simConstraint(d) {
  const o = { has_sim: '1' }
  if (d.simType !== 'all') o.sim_type = d.simType
  if (d.operators.length) o.operator = d.operators.join(',')
  if (d.operatorNone) o.operator_none = '1'
  if (d.providers.length) o.provider = d.providers.join(',')
  if (d.providerNone) o.provider_none = '1'
  return o
}
function toQuery(obj) {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(obj)) if (v) p.set(k, v)
  return p.toString()
}

const EMPTY_FILTERS = {
  simType: 'all',
  operators: [],
  operatorNone: false,
  providers: [],
  providerNone: false,
  assignedMode: 'none',
  employees: [],
  storagePlaces: [],
}

function countActive(f) {
  return (
    (f.simType !== 'all' ? 1 : 0) +
    (f.operators.length || f.operatorNone ? 1 : 0) +
    (f.providers.length || f.providerNone ? 1 : 0) +
    (f.assignedMode !== 'none' ? 1 : 0)
  )
}

const ACTIVE_COLUMNS = [
  { key: 'phone_number', label: 'Номер', sortable: true, width: 'minmax(0, 1.3fr)' },
  { key: 'employee__last_name', label: 'Сотрудник/Место', sortable: true, width: 'minmax(0, 1fr)' },
  { key: 'chevron', label: '', width: '30px' },
]
const UTILIZED_COLUMNS = [
  { key: 'phone_number', label: 'Номер', width: 'minmax(0, 1.3fr)' },
  { key: 'utilized_at', label: 'Дата утилизации', width: '170px' },
  { key: 'chevron', label: '', width: '30px' },
]

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('ru-RU')
}

// esimAtOperator — есть ли непривязанные E-SIM (тогда в «Место хранения»
// показываем «У оператора»); приходит из вызывающего компонента.
function simFilter(draft, setDraft, esimAtOperator) {
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }))
  const opEndpoint = `/api/sim-cards/operators/${draft.simType !== 'all' ? `?sim_type=${draft.simType}` : ''}`
  const provEndpoint = `/api/sim-cards/providers/${draft.simType !== 'all' ? `?sim_type=${draft.simType}` : ''}`
  return {
    main: (
      <>
        <div>
          <div className="ele-filter-section__title">Тип SIM</div>
          <RadioPills options={SIM_TYPE_FILTERS} value={draft.simType} onChange={(v) => set({ simType: v })} />
        </div>
        <div>
          <div className="ele-filter-section__title">Оператор</div>
          <div style={{ marginBottom: 8 }}>
            <Checkbox label="Без оператора" checked={draft.operatorNone} onChange={(v) => set({ operatorNone: v })} />
          </div>
          <RemoteMultiSelect
            endpoint={opEndpoint}
            mapOption={strOption}
            selected={draft.operators}
            onChange={(v) => set({ operators: v })}
            emptyText="Ничего не найдено"
            hideUntilSearch
          />
        </div>
        <div>
          <div className="ele-filter-section__title">Поставщик</div>
          <div style={{ marginBottom: 8 }}>
            <Checkbox label="Без поставщика" checked={draft.providerNone} onChange={(v) => set({ providerNone: v })} />
          </div>
          <RemoteMultiSelect
            endpoint={provEndpoint}
            mapOption={strOption}
            selected={draft.providers}
            onChange={(v) => set({ providers: v })}
            emptyText="Ничего не найдено"
            hideUntilSearch
          />
        </div>
      </>
    ),
    aside: (
      <div>
        <div className="ele-filter-section__title">Размещение</div>
        <RadioPills options={ASSIGNED_OPTIONS} value={draft.assignedMode} onChange={(v) => set({ assignedMode: v })} />
        {draft.assignedMode === 'employee' ? (
          <div style={{ marginTop: 10 }}>
            <EmployeeMultiPicker value={draft.employees} onChange={(e) => set({ employees: e })} extraParams={simConstraint(draft)} />
          </div>
        ) : null}
        {draft.assignedMode === 'storage' ? (
          <div style={{ marginTop: 10 }}>
            <RemoteMultiSelect
              endpoint={`/api/places/?place_type=storage&active=1&${toQuery(simConstraint(draft))}`}
              mapOption={placeOption}
              selected={draft.storagePlaces}
              onChange={(p) => set({ storagePlaces: p })}
              extraOptions={esimAtOperator ? [{ value: UNATTACHED, label: 'У оператора' }] : undefined}
            />
          </div>
        ) : null}
      </div>
    ),
  }
}

function simRow(row, { tab }) {
  return (
    <>
      {/* Номер — в первой строке; тип (SIM/E-SIM) и оператор/поставщик — во второй */}
      <div style={{ minWidth: 0 }}>
        <span style={{ font: '600 13.5px var(--font-mono)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.phone_number}</span>
        <div style={{ color: 'var(--color-text-placeholder)', fontSize: 12.5, marginTop: 2, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {`${row.sim_type_display} · ${[row.network_operator, row.provider].filter(Boolean).join(' / ') || 'без поставщика и оператора'}`}
        </div>
      </div>
      {tab === 'active' ? (
        <div style={{ minWidth: 0 }}>
          {row.employee_name ? (
            <EmployeeNameCell name={row.employee_name} position={row.position} department={row.department} status={row.acceptance_status} />
          ) : row.equipment_detail ? (
            <div style={{ minWidth: 0 }}>
              <TruncatedText singleLine={false} className="ele-clamp-2">{row.equipment_detail.type_and_model}</TruncatedText>
              <div style={{ font: '500 12px var(--font-mono)', color: 'var(--color-text-placeholder)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.equipment_detail.inventory_number}</div>
            </div>
          ) : row.sim_type === 'esim' ? (
            <span style={{ color: 'var(--color-text-placeholder)' }}>На хранении у оператора</span>
          ) : row.storage_place_detail ? (
            <>
              <TruncatedText singleLine={false} className="ele-clamp-2"><PlacementIcon placeType="storage" />{row.storage_place_detail.name}</TruncatedText>
              <div style={{ color: 'var(--color-text-placeholder)', fontSize: 12.5, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {row.storage_place_detail.building_name} — {row.storage_place_detail.room_name}
              </div>
            </>
          ) : (
            <div className="ele-clamp-2"><PlacementIcon placeType="storage" />Без склада</div>
          )}
        </div>
      ) : (
        <div style={{ color: 'var(--color-text-placeholder)', font: '500 13px var(--font-mono)' }}>{formatDate(row.utilized_at)}</div>
      )}
    </>
  )
}

export function SimListPage() {
  // Есть ли непривязанные E-SIM — тогда в «Место хранения» показываем «У оператора».
  const [esimAtOperator, setEsimAtOperator] = useState(false)
  useEffect(() => {
    apiGet('/api/sim-cards/unattached-exists/')
      .then((d) => setEsimAtOperator(!!d?.exists))
      .catch(() => {})
  }, [])

  return (
    <ListPage
      title="Корпоративная связь"
      headerPerm="canManageEmployees"
      headerActions={
        <Link to="/sim-cards/new">
          <Button title="Добавить SIM-карту" aria-label="Добавить SIM-карту">
            <Icon className="ele-only-desktop" name="plus" size={18} strokeWidth={2.2} />
            <span className="ele-only-desktop">Добавить SIM-карту</span>
            <Icon className="ele-only-mobile" name="plus" size={22} strokeWidth={2.4} />
          </Button>
        </Link>
      }
      cacheKey={CACHE_KEY}
      endpoint="/api/sim-cards/"
      tabs={TABS}
      emptyFilters={EMPTY_FILTERS}
      filterCount={countActive}
      renderFilter={({ draft, setDraft }) => simFilter(draft, setDraft, esimAtOperator)}
      buildParams={({ tab, isActive, filters, search, ordering }) => ({
        tab,
        sim_type: isActive && filters.simType !== 'all' ? filters.simType : undefined,
        operator: isActive ? csvParam(filters.operators) : undefined,
        operator_none: isActive && filters.operatorNone ? '1' : undefined,
        provider: isActive ? csvParam(filters.providers) : undefined,
        provider_none: isActive && filters.providerNone ? '1' : undefined,
        assigned: isActive && filters.assignedMode !== 'none' ? filters.assignedMode : undefined,
        employee: isActive && filters.assignedMode === 'employee' ? csvParam(filters.employees.map((e) => e.id)) : undefined,
        storage_place: isActive && filters.assignedMode === 'storage' ? csvParam(filters.storagePlaces.filter((v) => v !== UNATTACHED)) : undefined,
        storage_unattached: isActive && filters.assignedMode === 'storage' && filters.storagePlaces.includes(UNATTACHED) ? '1' : undefined,
        search: search || undefined,
        ordering,
      })}
      activeColumns={ACTIVE_COLUMNS}
      archiveColumns={UTILIZED_COLUMNS}
      renderRow={simRow}
      rowLink={(row) => `/sim-cards/${row.id}`}
      emptyText={({ search, tab }) => ({
        title: search ? 'Ничего не найдено' : tab === 'utilized' ? 'Нет утилизированных' : 'Пока пусто',
        description: search
          ? `По запросу «${search}» SIM-карты не найдены.`
          : tab === 'utilized'
            ? 'Утилизированные SIM-карты будут отображаться здесь.'
            : 'Когда вы добавите SIM-карту, она будет отображаться здесь.',
        resetLabel: 'Сбросить фильтры',
      })}
    />
  )
}
