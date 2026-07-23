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
import { PassAccessFilter } from '../../shared/PassAccessFilter.jsx'
import { csvParam } from '../../shared/filterParams.js'
import { KeyTarget } from '../../shared/keyTarget.jsx'

const CACHE_KEY = 'pass-list'

const TABS = [
  { value: 'active', label: 'Активные' },
  { value: 'utilized', label: 'Утилизировано' },
]
const OBJECT_TYPE_FILTERS = [
  { value: 'all', label: 'Все' },
  { value: 'key', label: 'Ключ' },
  { value: 'pass', label: 'Пропуск' },
]
// B27. «Размещение» — сотрудник / место хранения / не привязана (заменяет
// прежний фильтр «Статус»).
const ASSIGNED_OPTIONS = [
  { value: 'none', label: 'Не важно' },
  { value: 'employee', label: 'Сотрудник' },
  { value: 'storage', label: 'Место хранения' },
  { value: 'unattached', label: 'Не привязана' },
]

const placeOption = (p) => ({ value: String(p.id), label: p.name, sub: `${p.building_name} — ${p.room_name}` })

// Верхние фильтры (тип средства + доступ) → параметры ограничения опций
// сотрудников/мест хранения.
function passConstraint(d) {
  const o = { has_pass: '1' }
  if (d.objectType !== 'all') o.object_type = d.objectType
  if (d.buildings.length) o.buildings = d.buildings.join(',')
  if (d.rooms.length) o.rooms = d.rooms.join(',')
  if (d.places.length) o.places = d.places.join(',')
  return o
}
function toQuery(obj) {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(obj)) if (v) p.set(k, v)
  return p.toString()
}

const EMPTY_FILTERS = {
  objectType: 'all',
  buildings: [],
  rooms: [],
  places: [],
  assignedMode: 'none',
  employees: [],
  storagePlaces: [],
}

function countActive(f) {
  return (
    (f.objectType !== 'all' ? 1 : 0) +
    (f.buildings.length || f.rooms.length || f.places.length ? 1 : 0) +
    (f.assignedMode !== 'none' ? 1 : 0)
  )
}

const ACTIVE_COLUMNS = [
  { key: 'access', label: 'Название', width: 'minmax(0, 1.7fr)' },
  { key: 'employee__last_name', label: 'Сотрудник/Место', sortable: true, width: 'minmax(0, 1fr)' },
  { key: 'chevron', label: '', width: '30px' },
]
const UTILIZED_COLUMNS = [
  { key: 'access', label: 'Название', width: 'minmax(0, 1.7fr)' },
  { key: 'utilized_at', label: 'Дата утилизации', width: '170px' },
  { key: 'chevron', label: '', width: '30px' },
]

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('ru-RU')
}

// Тип пропуска для подписи «Пропуск (…)»: Авто / Пеший / Авто, Пеший.
function passTypes(pass) {
  return [pass.type_vehicle && 'Авто', pass.type_pedestrian && 'Пеший'].filter(Boolean).join(', ')
}

// Строки «Доступ в» для пропуска: по строке на здание с перечнем помещений (или
// «все помещения»). Тот же принцип, что и в PassInfo.
function accessLines(pass) {
  const rooms = pass.rooms || []
  const places = pass.places || []
  return (pass.buildings || []).map((b) => {
    const parts = [
      ...rooms.filter((r) => r.building === b.id).map((r) => r.name),
      ...places.filter((p) => p.building === b.id).map((p) => (p.room_name ? `${p.room_name} / ${p.name}` : p.name)),
    ]
    const roomsText = parts.length === 0 ? 'все помещения' : parts.join(', ')
    return { id: b.id, name: b.name, roomsText }
  })
}


export function PassListPage() {
  const isPop = useNavigationType() === 'POP'
  const savedUi = isPop ? readListCache(CACHE_KEY)?.ui : undefined
  const [tab, setTab] = useState(() => savedUi?.tab ?? 'active')
  const [filters, setFilters] = useState(() => ({ ...EMPTY_FILTERS, ...(savedUi?.filters ?? {}) }))
  const [search, setSearch] = useState(() => savedUi?.search ?? '')
  const debouncedSearch = useDebouncedValue(search)
  const [sort, setSort] = useState(() => savedUi?.sort ?? { key: 'created_at', dir: 'desc' })
  const columns = tab === 'active' ? ACTIVE_COLUMNS : UTILIZED_COLUMNS

  useEffect(() => {
    writeListCache(CACHE_KEY, { ui: { tab, filters, search, sort } })
  }, [tab, filters, search, sort])

  const isActive = tab === 'active'
  const ordering = sort.dir === 'desc' ? `-${sort.key}` : sort.key
  const { items, loading, loadingMore, hasMore, loadMore, error } = useCursorList(
    '/api/access-passes/',
    {
      tab,
      object_type: isActive && filters.objectType !== 'all' ? filters.objectType : undefined,
      assigned: isActive && filters.assignedMode !== 'none' ? filters.assignedMode : undefined,
      buildings: isActive ? csvParam(filters.buildings) : undefined,
      rooms: isActive ? csvParam(filters.rooms) : undefined,
      places: isActive ? csvParam(filters.places) : undefined,
      employee: isActive && filters.assignedMode === 'employee' ? csvParam(filters.employees.map((e) => e.id)) : undefined,
      storage_place: isActive && filters.assignedMode === 'storage' ? csvParam(filters.storagePlaces) : undefined,
      search: debouncedSearch || undefined,
      ordering,
    },
    { cacheKey: CACHE_KEY, restore: isPop },
  )
  useScrollRestoration(CACHE_KEY, isPop && !loading)

  const handleSort = (key) => {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="ele-page-head">
        <h1 style={{ fontSize: 'var(--font-size-h1)', fontWeight: 600, letterSpacing: 'var(--font-h1-letter-spacing)' }}>
          Средства доступа
        </h1>
        <Can perm="canManageEmployees">
          <div className="ele-page-head__actions">
            <Link to="/passes/new">
              <Button title="Добавить средство доступа" aria-label="Добавить средство доступа">
                <Icon className="ele-only-desktop" name="plus" size={18} strokeWidth={2.2} />
                <span className="ele-only-desktop">Добавить средство доступа</span>
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
                return {
                  main: (
                    <>
                    <div>
                      <div className="ele-filter-section__title">Тип средства</div>
                      <RadioPills options={OBJECT_TYPE_FILTERS} value={draft.objectType} onChange={(v) => set({ objectType: v })} />
                    </div>
                    <PassAccessFilter
                      buildings={draft.buildings}
                      rooms={draft.rooms}
                      places={draft.places}
                      onChange={set}
                      objectType={draft.objectType}
                    />
                    </>
                  ),
                  aside: (
                  <div>
                    <div className="ele-filter-section__title">Размещение</div>
                    <RadioPills options={ASSIGNED_OPTIONS} value={draft.assignedMode} onChange={(v) => set({ assignedMode: v })} />
                    {draft.assignedMode === 'employee' ? (
                      <div style={{ marginTop: 10 }}>
                        <EmployeeMultiPicker value={draft.employees} onChange={(e) => set({ employees: e })} extraParams={passConstraint(draft)} />
                      </div>
                    ) : null}
                    {draft.assignedMode === 'storage' ? (
                      <div style={{ marginTop: 10 }}>
                        <RemoteMultiSelect
                          endpoint={`/api/places/?place_type=storage&active=1&${toQuery(passConstraint(draft))}`}
                          mapOption={placeOption}
                          selected={draft.storagePlaces}
                          onChange={(p) => set({ storagePlaces: p })}
                        />
                      </div>
                    ) : null}
                  </div>
                  ),
                }
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
          title={search ? 'Ничего не найдено' : tab === 'utilized' ? 'Нет утилизированных' : 'Пока пусто'}
          description={
            search
              ? `По запросу «${search}» ничего не найдено.`
              : tab === 'utilized'
                ? 'Утилизированные пропуска и ключи будут отображаться здесь.'
                : 'Когда вы добавите пропуск или ключ, он будет отображаться здесь.'
          }
          action={search ? <Button variant="secondary" onClick={() => setSearch('')}>Сбросить фильтры</Button> : undefined}
        />
      ) : (
        <Table columns={columns} sortKey={sort.key} sortDir={sort.dir} onSort={handleSort}>
          {items.map((row) => {
            const isKey = row.object_type === 'key'
            return (
            <Link key={row.id} to={`/passes/${row.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
              <TableRow columns={columns}>
                {/* Название: тип + учётный номер, ниже — плашки типа (у пропуска) и
                    «Доступ в» (здания/помещения или объект ключа). */}
                <div style={{ minWidth: 0 }}>
                  <div className="ele-clamp-2" style={{ fontWeight: 600 }}>
                    {isKey ? 'Ключ' : `Пропуск${passTypes(row) ? ` (${passTypes(row)})` : ''}`}
                  </div>
                  <div style={{ font: '500 12px var(--font-mono)', color: 'var(--color-text-placeholder)', marginTop: 2 }}>
                    № {row.account_number && row.account_number.trim() ? row.account_number : 'б/н'}
                  </div>
                  <div style={{ marginTop: 5, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {isKey ? (
                      <div style={{ fontSize: 12.5, color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                        <KeyTarget pass={row} />
                      </div>
                    ) : accessLines(row).length === 0 ? (
                      <span style={{ color: 'var(--color-text-placeholder)', fontSize: 12.5 }}>—</span>
                    ) : (
                      accessLines(row).map((a) => (
                        <div key={a.id} style={{ fontSize: 12.5, color: 'var(--color-text-placeholder)' }}>
                          <span style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>{a.name}</span> — {a.roomsText}
                        </div>
                      ))
                    )}
                  </div>
                </div>
                {tab === 'active' ? (
                  <div style={{ minWidth: 0 }}>
                    {row.employee_name ? (
                      <>
                        <div className="ele-clamp-2">{row.employee_name}</div>
                        <div style={{ color: 'var(--color-text-placeholder)', fontSize: 12.5, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {[row.position, row.department].filter(Boolean).join(' · ') || '—'}
                        </div>
                      </>
                    ) : row.storage_place_detail ? (
                      <>
                        <div className="ele-clamp-2">На складе: {row.storage_place_detail.name}</div>
                        <div style={{ color: 'var(--color-text-placeholder)', fontSize: 12.5, marginTop: 2 }}>
                          {row.storage_place_detail.building_name} — {row.storage_place_detail.room_name}
                        </div>
                      </>
                    ) : (
                      <span style={{ color: 'var(--color-text-placeholder)' }}>На хранении</span>
                    )}
                  </div>
                ) : (
                  <div style={{ color: 'var(--color-text-placeholder)', font: '500 13px var(--font-mono)' }}>{formatDate(row.utilized_at)}</div>
                )}
                <div style={{ textAlign: 'right', color: 'var(--color-border-strong)' }}>
                  <Icon name="chevron-right" size={18} strokeWidth={2} />
                </div>
              </TableRow>
            </Link>
            )
          })}
          <InfiniteScrollSentinel hasMore={hasMore} loading={loadingMore} onLoadMore={loadMore} />
        </Table>
      )}
    </div>
  )
}
