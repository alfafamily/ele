import { useEffect, useState } from 'react'
import { Link, useNavigationType } from 'react-router-dom'
import { Can } from '../../app/usePermissions.js'
import { InfiniteScrollSentinel } from '../../shared/InfiniteScrollSentinel.jsx'
import { useCursorList } from '../../shared/hooks/useCursorList.js'
import { useDebouncedValue } from '../../shared/hooks/useDebouncedValue.js'
import { useScrollRestoration } from '../../shared/hooks/useScrollRestoration.js'
import { readListCache, writeListCache } from '../../shared/listCache.js'
import { Button, EmptyState, FilterModal, Icon, RadioPills, SearchInput, Skeleton, Table, TabBar, TableRow } from '../../shared/ui'
import { EmployeeMultiPicker } from '../../shared/EmployeeMultiPicker.jsx'
import { RemoteMultiSelect } from '../../shared/RemoteMultiSelect.jsx'
import { csvParam } from '../../shared/filterParams.js'

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

export function ToolListPage() {
  const isPop = useNavigationType() === 'POP'
  const savedUi = isPop ? readListCache(CACHE_KEY)?.ui : undefined
  const [tab, setTab] = useState(() => savedUi?.tab ?? 'active')
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
    '/api/tools/',
    {
      tab,
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
          Инструменты
        </h1>
        <Can perm="canManageEquipment">
          <div className="ele-page-head__actions">
            <Link to="/tools/new">
              <Button title="Добавить инструмент" aria-label="Добавить инструмент">
                <Icon className="ele-only-desktop" name="plus" size={18} strokeWidth={2.2} />
                <span className="ele-only-desktop">Добавить инструмент</span>
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
              ? `По запросу «${search}» инструменты не найдены. Попробуйте изменить запрос.`
              : tab === 'archive'
                ? 'Списанные инструменты будут отображаться здесь.'
                : 'Когда вы добавите инструмент, он будет отображаться здесь.'
          }
          action={
            search ? (
              <Button variant="secondary" onClick={() => setSearch('')}>
                Сбросить поиск
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Table columns={columns} sortKey={sort.key} sortDir={sort.dir} onSort={handleSort}>
          {items.map((row) => (
            <Link key={row.id} to={`/tools/${row.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
              <TableRow columns={columns}>
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
