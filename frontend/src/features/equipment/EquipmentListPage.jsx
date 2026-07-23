import { useEffect, useState } from 'react'
import { Link, useNavigationType } from 'react-router-dom'
import { Can, usePermissions } from '../../app/usePermissions.js'
import { canMaintainType } from '../../shared/permissions.js'
import { InfiniteScrollSentinel } from '../../shared/InfiniteScrollSentinel.jsx'
import { useCursorList } from '../../shared/hooks/useCursorList.js'
import { useDebouncedValue } from '../../shared/hooks/useDebouncedValue.js'
import { useScrollRestoration } from '../../shared/hooks/useScrollRestoration.js'
import { readListCache, writeListCache } from '../../shared/listCache.js'
import { Button, EmptyState, FilterModal, Icon, MultiSelectList, RadioPills, SearchInput, Skeleton, Table, TabBar, TableRow } from '../../shared/ui'
import { EmployeeMultiPicker } from '../../shared/EmployeeMultiPicker.jsx'
import { RemoteMultiSelect } from '../../shared/RemoteMultiSelect.jsx'
import { TypeRequisiteFilter } from '../../shared/TypeRequisiteFilter.jsx'
import { csvParam, reqParams } from '../../shared/filterParams.js'
import { maintenanceRowIndicators } from './statusLabels.js'

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

export function EquipmentListPage() {
  // Восстанавливаем состояние списка (фильтры/сортировка/поиск, подгруженные
  // страницы, прокрутку) только при переходе «назад» (POP) — например, с
  // карточки объекта. При заходе в раздел через меню (PUSH) открываем заново.
  const isPop = useNavigationType() === 'POP'
  const savedUi = isPop ? readListCache(CACHE_KEY)?.ui : undefined
  const [tab, setTab] = useState(() => savedUi?.tab ?? 'active')
  const perms = usePermissions()
  const [filters, setFilters] = useState(() => ({ ...EMPTY_FILTERS, ...(savedUi?.filters ?? {}) }))
  const [search, setSearch] = useState(() => savedUi?.search ?? '')
  const debouncedSearch = useDebouncedValue(search)
  const [sort, setSort] = useState(() => savedUi?.sort ?? { key: 'created_at', dir: 'desc' })

  useEffect(() => {
    writeListCache(CACHE_KEY, { ui: { tab, filters, search, sort } })
  }, [tab, filters, search, sort])

  const isActive = tab === 'active'
  const ordering = sort.dir === 'desc' ? `-${sort.key}` : sort.key
  const { items, loading, loadingMore, hasMore, loadMore, error } = useCursorList(
    '/api/equipment/',
    {
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
      search: debouncedSearch || undefined,
      ordering,
    },
    { cacheKey: CACHE_KEY, restore: isPop },
  )
  useScrollRestoration(CACHE_KEY, isPop && !loading)

  const columns = tab === 'active' ? ACTIVE_COLUMNS : ARCHIVE_COLUMNS

  const handleSort = (key) => {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="ele-page-head">
        <h1 style={{ fontSize: 'var(--font-size-h1)', fontWeight: 600, letterSpacing: 'var(--font-h1-letter-spacing)' }}>
          Оборудование
        </h1>
        <Can perm="canManageEquipment">
          <div className="ele-page-head__actions">
            <Link to="/equipment-types">
              <Button variant="secondary" title="Настроить типы" aria-label="Настроить типы">
                <span className="ele-only-desktop">Настроить типы</span>
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
          </div>
        </Can>
      </div>

      <div className="ele-list-controls">
        <div className="ele-list-controls__tabs">
          <TabBar options={TABS} value={tab} onChange={setTab} />
        </div>
        <div className="ele-list-controls__search">
          <SearchInput value={search} onChange={setSearch} placeholder="Поиск" />
        </div>
        {isActive ? (
          <div className="ele-list-controls__filter">
            <FilterModal
              value={filters}
              count={countActive(filters)}
              onApply={setFilters}
              onClear={() => setFilters(EMPTY_FILTERS)}
              isDraftActive={(d) => countActive(d) > 0}
            >
              {(draft, setDraft) => {
                const set = (patch) => setDraft((d) => ({ ...d, ...patch }))
                return (
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
                      label="Тип оборудования"
                      types={draft.types}
                      onTypesChange={(t) => set({ types: t })}
                      req={draft.req}
                      onReqChange={(r) => set({ req: r })}
                    />
                  </>
                )
              }}
              aside={(draft, setDraft) => {
                const set = (patch) => setDraft((d) => ({ ...d, ...patch }))
                return (
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
                )
              }}
            </FilterModal>
          </div>
        ) : null}
      </div>

      {error ? (
        <div style={{ color: 'var(--color-error)', fontSize: 14 }}>Не удалось загрузить список.</div>
      ) : loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Skeleton height={52} />
          <Skeleton height={52} />
          <Skeleton height={52} />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title={search ? 'Ничего не найдено' : tab === 'archive' ? 'Списанного нет' : 'Пока пусто'}
          description={
            search
              ? `По запросу «${search}» оборудование не найдено. Попробуйте изменить запрос или сбросить фильтры.`
              : tab === 'archive'
                ? 'Списанное оборудование будет отображаться здесь.'
                : 'Когда вы добавите оборудование, оно будет отображаться здесь.'
          }
          action={
            search ? (
              <Button variant="secondary" onClick={() => setSearch('')}>
                Сбросить фильтры
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Table columns={columns} sortKey={sort.key} sortDir={sort.dir} onSort={handleSort}>
          {items.map((row) => (
            <Link key={row.id} to={`/equipment/${row.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
              <TableRow columns={columns}>
                {/* Наименование (Тип+Модель) в 2 строки + учётный номер ниже.
                    B13: пара иконок статуса ТО (гаечный ключ + часы). */}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {/* B23: цветные статусы проведения ТО — только для типов, по
                        которым пользователь проводит ТО (в своей области) или для
                        Наблюдателя; серый «нет даты» — дополнительно для тех, кто
                        управляет регламентами (задать дату — их зона). */}
                    {maintenanceRowIndicators(row.maintenance_summary, {
                      fullStatus: canMaintainType(perms, row.equipment_type) || perms.isObserver,
                      manageOnly: perms.canManageMaintenance,
                    }).map((ind, i) => (
                      <span
                        key={i}
                        title={ind.title}
                        style={{ display: 'inline-flex', alignItems: 'center', flex: 'none', color: ind.color }}
                      >
                        <Icon name={ind.icon} size={16} strokeWidth={2} />
                      </span>
                    ))}
                    <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.type_and_model}</span>
                  </div>
                  <div style={{ font: '500 12px var(--font-mono)', color: 'var(--color-text-placeholder)', marginTop: 2 }}>{row.inventory_number}</div>
                </div>
                {tab === 'active' ? (
                  // Размещение: сотрудник (ФИО + отдел) / рабочее место / склад
                  <div style={{ minWidth: 0 }}>
                    {row.employee_name ? (
                      <>
                        <div className="ele-clamp-2">{row.employee_name}</div>
                        <div style={{ color: 'var(--color-text-placeholder)', fontSize: 12.5, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {[row.position, row.department].filter(Boolean).join(' · ') || '—'}
                        </div>
                      </>
                    ) : row.place_detail ? (
                      <>
                        <div className="ele-clamp-2">
                          {row.place_detail.place_type === 'workplace' ? 'На рабочем месте' : 'На складе'}: {row.place_detail.name}
                        </div>
                        <div style={{ color: 'var(--color-text-placeholder)', fontSize: 12.5, marginTop: 2 }}>
                          {row.place_detail.building_name} — {row.place_detail.room_name}
                        </div>
                      </>
                    ) : (
                      <span style={{ color: 'var(--color-text-placeholder)' }}>Не размещено</span>
                    )}
                  </div>
                ) : (
                  <div style={{ color: 'var(--color-text-placeholder)', font: '500 13px var(--font-mono)' }}>
                    {formatDate(row.written_off_at)}
                  </div>
                )}
                <div style={{ textAlign: 'right', color: 'var(--color-border-strong)' }}>
                  <Icon name="chevron-right" size={18} strokeWidth={2} />
                </div>
              </TableRow>
            </Link>
          ))}
          <InfiniteScrollSentinel hasMore={hasMore} loading={loadingMore} onLoadMore={loadMore} />
        </Table>
      )}
    </div>
  )
}
