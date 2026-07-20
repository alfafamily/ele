import { useEffect, useState } from 'react'
import { Link, useNavigationType } from 'react-router-dom'
import { Can } from '../../app/usePermissions.js'
import { InfiniteScrollSentinel } from '../../shared/InfiniteScrollSentinel.jsx'
import { useCursorList } from '../../shared/hooks/useCursorList.js'
import { useDebouncedValue } from '../../shared/hooks/useDebouncedValue.js'
import { useScrollRestoration } from '../../shared/hooks/useScrollRestoration.js'
import { readListCache, writeListCache } from '../../shared/listCache.js'
import { Badge, Button, EmptyState, FilterButton, Icon, SearchInput, Skeleton, Table, TabBar, TableRow } from '../../shared/ui'
import { KeyTarget } from '../../shared/keyTarget.jsx'

const CACHE_KEY = 'pass-list'

const TABS = [
  { value: 'active', label: 'Активные' },
  { value: 'utilized', label: 'Утилизировано' },
]
// Фильтр статуса внутри «Активных»: выданы сотруднику / свободные.
const FILTERS = [
  { value: 'all', label: 'Все' },
  { value: 'attached', label: 'Выданные' },
  { value: 'free', label: 'Неиспользуемые' },
]

const ACTIVE_COLUMNS = [
  { key: 'access', label: 'Название', width: 'minmax(0, 1.7fr)' },
  { key: 'employee__last_name', label: 'Закреплено за', sortable: true, width: 'minmax(0, 1fr)' },
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
    '/api/access-passes/',
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
                    {isKey ? 'Ключ' : 'Пропуск'}
                  </div>
                  <div style={{ font: '500 12px var(--font-mono)', color: 'var(--color-text-placeholder)', marginTop: 2 }}>
                    № {row.account_number && row.account_number.trim() ? row.account_number : 'б/н'}
                  </div>
                  {!isKey && (row.type_vehicle || row.type_pedestrian) ? (
                    <div style={{ display: 'flex', gap: 5, marginTop: 5 }}>
                      {row.type_vehicle ? <Badge>Авто</Badge> : null}
                      {row.type_pedestrian ? <Badge>Пеший</Badge> : null}
                    </div>
                  ) : null}
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
                      <div className="ele-clamp-2">{row.employee_name}</div>
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
            )
          })}
          <InfiniteScrollSentinel hasMore={hasMore} loading={loadingMore} onLoadMore={loadMore} />
        </Table>
      )}
    </div>
  )
}
