import { useEffect, useState } from 'react'
import { Link, useNavigationType } from 'react-router-dom'
import { Can } from '../../app/usePermissions.js'
import { InfiniteScrollSentinel } from '../../shared/InfiniteScrollSentinel.jsx'
import { useCursorList } from '../../shared/hooks/useCursorList.js'
import { useDebouncedValue } from '../../shared/hooks/useDebouncedValue.js'
import { useScrollRestoration } from '../../shared/hooks/useScrollRestoration.js'
import { readListCache, writeListCache } from '../../shared/listCache.js'
import { Button, EmptyState, FilterModal, Icon, RadioPills, SearchInput, Skeleton, Table, TabBar, TableRow } from '../../shared/ui'
import { EquipmentMultiPicker } from '../../shared/EquipmentMultiPicker.jsx'
import { RemoteMultiSelect } from '../../shared/RemoteMultiSelect.jsx'
import { TypeRequisiteFilter } from '../../shared/TypeRequisiteFilter.jsx'
import { csvParam, reqParams } from '../../shared/filterParams.js'

const CACHE_KEY = 'license-list'

const TABS = [
  { value: 'active', label: 'Активные' },
  { value: 'archive', label: 'Утилизированные' },
]
const FILTERS = [
  { value: 'all', label: 'Все' },
  { value: 'occupied', label: 'Занятые' },
  { value: 'free', label: 'Свободные' },
]
const KIND_FILTERS = [
  { value: 'all', label: 'Все' },
  { value: 'software', label: 'Программная' },
  { value: 'hardware', label: 'Аппаратная' },
]
// B27. «Закреплён за» — место хранения / оборудование.
const ASSIGNED_OPTIONS = [
  { value: 'none', label: 'Не важно' },
  { value: 'storage', label: 'Место хранения' },
  { value: 'equipment', label: 'Оборудование' },
]

const KIND_LABEL = { software: 'Программная', hardware: 'Аппаратная' }

const placeOption = (p) => ({ value: String(p.id), label: p.name, sub: `${p.building_name} — ${p.room_name}` })

const EMPTY_FILTERS = {
  status: 'all',
  types: [],
  req: {},
  kind: 'all',
  assignedMode: 'none',
  storagePlaces: [],
  equipment: [],
}

function countActive(f) {
  return (
    (f.status !== 'all' ? 1 : 0) +
    (f.types.length ? 1 : 0) +
    Object.keys(f.req).length +
    (f.kind !== 'all' ? 1 : 0) +
    (f.assignedMode === 'storage' && f.storagePlaces.length ? 1 : 0) +
    (f.assignedMode === 'equipment' && f.equipment.length ? 1 : 0)
  )
}

const ACTIVE_COLUMNS = [
  { key: 'license_type__name', label: 'Наименование', sortable: true, width: 'minmax(0, 1.4fr)' },
  { key: 'equipment__inventory_number', label: 'Оборудование/Место', sortable: true, width: 'minmax(0, 1fr)' },
  { key: 'chevron', label: '', width: '30px' },
]
const ARCHIVE_COLUMNS = [
  { key: 'license_type__name', label: 'Наименование', width: 'minmax(0, 1.4fr)' },
  { key: 'retired_at', label: 'Дата утилизации', width: '170px' },
  { key: 'chevron', label: '', width: '30px' },
]

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('ru-RU')
}

export function LicenseListPage() {
  // Восстанавливаем состояние списка только при переходе «назад» (POP) —
  // например, с карточки объекта; при заходе через меню (PUSH) открываем заново.
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
    '/api/licenses/',
    {
      tab,
      status: isActive && filters.status !== 'all' ? filters.status : undefined,
      type: isActive ? csvParam(filters.types) : undefined,
      ...(isActive ? reqParams(filters.req) : {}),
      kind: isActive && filters.kind !== 'all' ? filters.kind : undefined,
      storage_place: isActive && filters.assignedMode === 'storage' ? csvParam(filters.storagePlaces) : undefined,
      equipment: isActive && filters.assignedMode === 'equipment' ? csvParam(filters.equipment.map((e) => e.id)) : undefined,
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
          Лицензии
        </h1>
        <Can perm="canManageLicenses">
          <div className="ele-page-head__actions">
            <Link to="/license-types">
              <Button variant="secondary" title="Настроить типы" aria-label="Настроить типы">
                <span className="ele-only-desktop">Настроить типы</span>
                <Icon className="ele-only-mobile" name="columns-3-cog" size={20} strokeWidth={1.9} />
              </Button>
            </Link>
            <Link to="/licenses/new">
              <Button title="Добавить лицензию" aria-label="Добавить лицензию">
                <Icon className="ele-only-desktop" name="plus" size={18} strokeWidth={2.2} />
                <span className="ele-only-desktop">Добавить лицензию</span>
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
                    <div>
                      <div className="ele-filter-section__title">Статус</div>
                      <RadioPills options={FILTERS} value={draft.status} onChange={(v) => set({ status: v })} />
                    </div>
                    <TypeRequisiteFilter
                      endpoint="/api/license-types/"
                      valuesBase="/api/licenses/field-values/"
                      label="Тип лицензии"
                      types={draft.types}
                      onTypesChange={(t) => set({ types: t })}
                      req={draft.req}
                      onReqChange={(r) => set({ req: r })}
                    />
                    <div>
                      <div className="ele-filter-section__title">Вид</div>
                      <RadioPills options={KIND_FILTERS} value={draft.kind} onChange={(v) => set({ kind: v })} />
                    </div>
                    <div>
                      <div className="ele-filter-section__title">Закреплена за</div>
                      <RadioPills options={ASSIGNED_OPTIONS} value={draft.assignedMode} onChange={(v) => set({ assignedMode: v })} />
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
                      {draft.assignedMode === 'equipment' ? (
                        <div style={{ marginTop: 10 }}>
                          <EquipmentMultiPicker value={draft.equipment} onChange={(e) => set({ equipment: e })} />
                        </div>
                      ) : null}
                    </div>
                  </>
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
          title={search ? 'Ничего не найдено' : tab === 'archive' ? 'Утилизированных нет' : 'Пока пусто'}
          description={
            search
              ? `По запросу «${search}» лицензии не найдены. Попробуйте изменить запрос или сбросить фильтры.`
              : tab === 'archive'
                ? 'Утилизированные лицензии будут отображаться здесь.'
                : 'Когда вы добавите лицензию, она будет отображаться здесь.'
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
            <Link key={row.id} to={`/licenses/${row.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
              <TableRow columns={columns}>
                {/* B18: наименование = Тип лицензии; ниже — вид (программная/аппаратная) */}
                <div style={{ minWidth: 0 }}>
                  <div className="ele-clamp-2" style={{ fontWeight: 600 }}>{row.license_type_name}</div>
                  <div style={{ color: 'var(--color-text-placeholder)', fontSize: 12.5, marginTop: 2 }}>{KIND_LABEL[row.license_type_kind] || ''}</div>
                </div>
                {tab === 'active' ? (
                  // Размещение: за оборудованием (тип+модель+учётный номер) либо
                  // свободная — на складе (место хранения с зданием/помещением).
                  <div style={{ minWidth: 0 }}>
                    {row.equipment_detail ? (
                      <>
                        <div className="ele-clamp-2">{row.equipment_detail.type_and_model}</div>
                        <div style={{ font: '500 12px var(--font-mono)', color: 'var(--color-text-placeholder)', marginTop: 2 }}>{row.equipment_detail.inventory_number}</div>
                      </>
                    ) : row.storage_place_detail ? (
                      <>
                        <div className="ele-clamp-2">На складе: {row.storage_place_detail.name}</div>
                        <div style={{ color: 'var(--color-text-placeholder)', fontSize: 12.5, marginTop: 2 }}>
                          {row.storage_place_detail.building_name} — {row.storage_place_detail.room_name}
                        </div>
                      </>
                    ) : (
                      <span style={{ color: 'var(--color-text-placeholder)' }}>Не привязана</span>
                    )}
                  </div>
                ) : (
                  <div style={{ color: 'var(--color-text-placeholder)', font: '500 13px var(--font-mono)' }}>{formatDate(row.retired_at)}</div>
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
