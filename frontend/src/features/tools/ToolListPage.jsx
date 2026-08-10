import { Link } from 'react-router-dom'
import { csvParam } from '../../shared/filterParams.js'
import { ListPage } from '../../shared/ListPage.jsx'
import { Button, Icon, RadioPills } from '../../shared/ui'
import { EmployeeMultiPicker } from '../../shared/EmployeeMultiPicker.jsx'
import { RemoteMultiSelect } from '../../shared/RemoteMultiSelect.jsx'

const CACHE_KEY = 'tools-list'

const TABS = [
  { value: 'active', label: 'Активные' },
  { value: 'archive', label: 'Списанные' },
]
// B27. «Размещение» инструмента (как у оборудования): за сотрудником / на рабочем
// месте / на складе (свободный остаток). Заменяет прежний фильтр «Остаток».
const ASSIGNED_OPTIONS = [
  { value: 'none', label: 'Не важно' },
  { value: 'employee', label: 'Сотрудник' },
  { value: 'storage', label: 'Место хранения' },
  { value: 'workplace', label: 'Рабочее место' },
]

const placeOption = (p) => ({ value: String(p.id), label: p.name, sub: `${p.building_name} — ${p.room_name}` })

const EMPTY_FILTERS = {
  assignedMode: 'none',
  employees: [],
  storagePlaces: [],
  workplaces: [],
}

function countActive(f) {
  return f.assignedMode !== 'none' ? 1 : 0
}

const ACTIVE_COLUMNS = [
  { key: 'name', label: 'Наименование', sortable: true, width: 'minmax(0, 1.4fr)' },
  { key: 'stock', label: 'Остаток', width: 'minmax(0, 1fr)' },
  { key: 'chevron', label: '', width: '30px' },
]
const ARCHIVE_COLUMNS = [
  { key: 'name', label: 'Наименование', width: 'minmax(0, 1.4fr)' },
  { key: 'written_off_at', label: 'Дата списания', width: '170px' },
  { key: 'chevron', label: '', width: '30px' },
]

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('ru-RU')
}

function toolFilter(draft, setDraft) {
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }))
  return (
    <div>
      <div className="ele-filter-section__title">Размещение</div>
      <RadioPills options={ASSIGNED_OPTIONS} value={draft.assignedMode} onChange={(v) => set({ assignedMode: v })} />
      {draft.assignedMode === 'employee' ? (
        <div style={{ marginTop: 10 }}>
          <EmployeeMultiPicker value={draft.employees} onChange={(e) => set({ employees: e })} />
        </div>
      ) : null}
      {draft.assignedMode === 'storage' ? (
        <div style={{ marginTop: 10 }}>
          <RemoteMultiSelect
            endpoint="/api/places/?place_type=storage&active=1"
            mapOption={placeOption}
            selected={draft.storagePlaces}
            onChange={(p) => set({ storagePlaces: p })}
          />
        </div>
      ) : null}
      {draft.assignedMode === 'workplace' ? (
        <div style={{ marginTop: 10 }}>
          <RemoteMultiSelect
            endpoint="/api/places/?place_type=workplace&active=1"
            mapOption={placeOption}
            selected={draft.workplaces}
            onChange={(p) => set({ workplaces: p })}
          />
        </div>
      ) : null}
    </div>
  )
}

export function ToolListPage() {
  return (
    <ListPage
      title="Инструменты"
      headerPerm="canManageEquipment"
      headerActions={
        <Link to="/tools/new">
          <Button title="Добавить инструмент" aria-label="Добавить инструмент">
            <Icon className="ele-only-desktop" name="plus" size={18} strokeWidth={2.2} />
            <span className="ele-only-desktop">Добавить инструмент</span>
            <Icon className="ele-only-mobile" name="plus" size={22} strokeWidth={2.4} />
          </Button>
        </Link>
      }
      cacheKey={CACHE_KEY}
      endpoint="/api/tools/"
      tabs={TABS}
      emptyFilters={EMPTY_FILTERS}
      filterCount={countActive}
      renderFilter={({ draft, setDraft }) => toolFilter(draft, setDraft)}
      buildParams={({ tab, isActive, filters, search, ordering }) => ({
        tab,
        assigned: isActive && filters.assignedMode !== 'none' ? filters.assignedMode : undefined,
        employee: isActive && filters.assignedMode === 'employee' ? csvParam(filters.employees.map((e) => e.id)) : undefined,
        place_storage: isActive && filters.assignedMode === 'storage' ? csvParam(filters.storagePlaces) : undefined,
        place_workplace: isActive && filters.assignedMode === 'workplace' ? csvParam(filters.workplaces) : undefined,
        search: search || undefined,
        ordering,
      })}
      activeColumns={ACTIVE_COLUMNS}
      archiveColumns={ARCHIVE_COLUMNS}
      renderRow={(row, { tab }) => (
        <>
          <div style={{ minWidth: 0 }}>
            <div className="ele-clamp-2" style={{ fontWeight: 500 }}>{row.name}</div>
          </div>
          {tab === 'active' ? (
            <div style={{ minWidth: 0 }}>
              <div>Всего/свободно: {row.quantity}/{row.free}</div>
              <div style={{ color: 'var(--color-text-placeholder)', fontSize: 12.5, marginTop: 2 }}>
                Закреплено: {row.allocated}
              </div>
            </div>
          ) : (
            <div style={{ color: 'var(--color-text-placeholder)', font: '500 13px var(--font-mono)' }}>
              {formatDate(row.written_off_at)}
            </div>
          )}
        </>
      )}
      rowLink={(row) => `/tools/${row.id}`}
      emptyText={({ search, tab }) => ({
        title: search ? 'Ничего не найдено' : tab === 'archive' ? 'Списанного нет' : 'Пока пусто',
        description: search
          ? `По запросу «${search}» инструменты не найдены. Попробуйте изменить запрос.`
          : tab === 'archive'
            ? 'Списанные инструменты будут отображаться здесь.'
            : 'Когда вы добавите инструмент, он будет отображаться здесь.',
        resetLabel: 'Сбросить поиск',
      })}
    />
  )
}
