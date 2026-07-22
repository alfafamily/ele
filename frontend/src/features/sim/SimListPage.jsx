import { useEffect, useState } from 'react'
import { Link, useNavigationType } from 'react-router-dom'
import { Can } from '../../app/usePermissions.js'
import { InfiniteScrollSentinel } from '../../shared/InfiniteScrollSentinel.jsx'
import { useCursorList } from '../../shared/hooks/useCursorList.js'
import { useDebouncedValue } from '../../shared/hooks/useDebouncedValue.js'
import { useScrollRestoration } from '../../shared/hooks/useScrollRestoration.js'
import { readListCache, writeListCache } from '../../shared/listCache.js'
import { Button, EmptyState, FilterButton, Icon, SearchInput, Skeleton, Table, TabBar, TableRow } from '../../shared/ui'

const CACHE_KEY = 'sim-list'

const TABS = [
  { value: 'active', label: 'Активные' },
  { value: 'utilized', label: 'Утилизировано' },
]
// Фильтр статуса внутри «Активных»: за сотрудником / свободные.
const FILTERS = [
  { value: 'all', label: 'Все' },
  { value: 'attached', label: 'Активные' },
  { value: 'free', label: 'Неактивные' },
]

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

export function SimListPage() {
  const isPop = useNavigationType() === 'POP'
  const savedUi = isPop ? readListCache(CACHE_KEY)?.ui : undefined
  const [tab, setTab] = useState(() => savedUi?.tab ?? 'active')
  const [status, setStatus] = useState(() => savedUi?.status ?? 'all')
  const [search, setSearch] = useState(() => savedUi?.search ?? '')
  const debouncedSearch = useDebouncedValue(search)
  const [sort, setSort] = useState(() => savedUi?.sort ?? { key: 'created_at', dir: 'desc' })
  const columns = tab === 'active' ? ACTIVE_COLUMNS : UTILIZED_COLUMNS

  useEffect(() => {
    writeListCache(CACHE_KEY, { ui: { tab, status, search, sort } })
  }, [tab, status, search, sort])

  const ordering = sort.dir === 'desc' ? `-${sort.key}` : sort.key
  const { items, loading, loadingMore, hasMore, loadMore, error } = useCursorList(
    '/api/sim-cards/',
    { tab, status: tab === 'active' ? status : undefined, search: debouncedSearch || undefined, ordering },
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
          Корпоративная связь
        </h1>
        <Can perm="canManageEmployees">
          <div className="ele-page-head__actions">
            <Link to="/sim-cards/new">
              <Button title="Добавить SIM-карту" aria-label="Добавить SIM-карту">
                <Icon className="ele-only-desktop" name="plus" size={18} strokeWidth={2.2} />
                <span className="ele-only-desktop">Добавить SIM-карту</span>
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
            <FilterButton options={FILTERS} value={status} onChange={setStatus} />
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
              ? `По запросу «${search}» SIM-карты не найдены.`
              : tab === 'utilized'
                ? 'Утилизированные SIM-карты будут отображаться здесь.'
                : 'Когда вы добавите SIM-карту, она будет отображаться здесь.'
          }
          action={search ? <Button variant="secondary" onClick={() => setSearch('')}>Сбросить фильтры</Button> : undefined}
        />
      ) : (
        <Table columns={columns} sortKey={sort.key} sortDir={sort.dir} onSort={handleSort}>
          {items.map((row) => (
            <Link key={row.id} to={`/sim-cards/${row.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
              <TableRow columns={columns}>
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
                      <>
                        <div className="ele-clamp-2">{row.employee_name}</div>
                        <div style={{ color: 'var(--color-text-placeholder)', fontSize: 12.5, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {[row.position, row.department].filter(Boolean).join(' · ') || '—'}
                        </div>
                      </>
                    ) : row.equipment_detail ? (
                      <div style={{ minWidth: 0 }}>
                        <div className="ele-clamp-2">{row.equipment_detail.type_and_model}</div>
                        <div style={{ font: '500 12px var(--font-mono)', color: 'var(--color-text-placeholder)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.equipment_detail.inventory_number}</div>
                      </div>
                    ) : row.sim_type === 'esim' ? (
                      <span style={{ color: 'var(--color-text-placeholder)' }}>На хранении у оператора</span>
                    ) : row.storage_place_detail ? (
                      <div className="ele-clamp-2">На складе: {row.storage_place_detail.name}</div>
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
          ))}
          <InfiniteScrollSentinel hasMore={hasMore} loading={loadingMore} onLoadMore={loadMore} />
        </Table>
      )}
    </div>
  )
}
