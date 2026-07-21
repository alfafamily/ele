import { useEffect, useState } from 'react'
import { Link, useNavigationType } from 'react-router-dom'
import { Can } from '../../app/usePermissions.js'
import { InfiniteScrollSentinel } from '../../shared/InfiniteScrollSentinel.jsx'
import { useCursorList } from '../../shared/hooks/useCursorList.js'
import { useDebouncedValue } from '../../shared/hooks/useDebouncedValue.js'
import { useScrollRestoration } from '../../shared/hooks/useScrollRestoration.js'
import { readListCache, writeListCache } from '../../shared/listCache.js'
import { Button, EmptyState, FilterButton, Icon, SearchInput, Skeleton, Table, TabBar, TableRow } from '../../shared/ui'
import { MAINTENANCE_STATUS_ICON } from './statusLabels.js'

const CACHE_KEY = 'equipment-list'

// B13. Мультивыбор-фильтры по статусу ТО (можно оба сразу).
const MAINTENANCE_FILTERS = [
  { value: 'due', label: 'Подходит дата ТО' },
  { value: 'overdue', label: 'ТО просрочено' },
]

const TABS = [
  { value: 'active', label: 'Активное' },
  { value: 'archive', label: 'Списанное' },
]
const FILTERS = [
  { value: 'all', label: 'Все' },
  { value: 'assigned', label: 'За сотрудником' },
  { value: 'stationary', label: 'На рабочем месте' },
  { value: 'free', label: 'На складе' },
]

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
  const [status, setStatus] = useState(() => savedUi?.status ?? 'all')
  // Мультивыбор ТО: массив из 'due' / 'overdue'.
  const [toDates, setToDates] = useState(() => savedUi?.toDates ?? [])
  const [search, setSearch] = useState(() => savedUi?.search ?? '')
  const debouncedSearch = useDebouncedValue(search)
  const [sort, setSort] = useState(() => savedUi?.sort ?? { key: 'created_at', dir: 'desc' })

  useEffect(() => {
    writeListCache(CACHE_KEY, { ui: { tab, status, toDates, search, sort } })
  }, [tab, status, toDates, search, sort])

  const toggleToDate = (v) =>
    setToDates((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]))

  const ordering = sort.dir === 'desc' ? `-${sort.key}` : sort.key
  const { items, loading, loadingMore, hasMore, loadMore, error } = useCursorList(
    '/api/equipment/',
    {
      tab,
      status: tab === 'active' ? status : undefined,
      to_due: tab === 'active' && toDates.includes('due') ? '1' : undefined,
      to_overdue: tab === 'active' && toDates.includes('overdue') ? '1' : undefined,
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
        {tab === 'active' ? (
          <div className="ele-list-controls__filter">
            <FilterButton
              options={FILTERS}
              value={status}
              onChange={setStatus}
              extra={{
                title: 'Техобслуживание',
                options: MAINTENANCE_FILTERS,
                values: toDates,
                onToggle: toggleToDate,
              }}
            />
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
                    B13: иконка-индикатор ТО (подходит/просрочено). */}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {MAINTENANCE_STATUS_ICON[row.maintenance_status] ? (
                      <Icon
                        name={MAINTENANCE_STATUS_ICON[row.maintenance_status].name}
                        size={16}
                        strokeWidth={2}
                        title={MAINTENANCE_STATUS_ICON[row.maintenance_status].title}
                        style={{ color: MAINTENANCE_STATUS_ICON[row.maintenance_status].color, flex: 'none' }}
                      />
                    ) : null}
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
                        <div style={{ color: 'var(--color-text-placeholder)', fontSize: 12.5, marginTop: 2 }}>{row.department || '—'}</div>
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
