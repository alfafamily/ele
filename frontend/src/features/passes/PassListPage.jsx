import { useEffect, useState } from 'react'
import { Link, useNavigationType } from 'react-router-dom'
import { Can } from '../../app/usePermissions.js'
import { InfiniteScrollSentinel } from '../../shared/InfiniteScrollSentinel.jsx'
import { useCursorList } from '../../shared/hooks/useCursorList.js'
import { useDebouncedValue } from '../../shared/hooks/useDebouncedValue.js'
import { useScrollRestoration } from '../../shared/hooks/useScrollRestoration.js'
import { readListCache, writeListCache } from '../../shared/listCache.js'
import { Button, EmptyState, Icon, SearchInput, Skeleton, Table, TabBar, TableRow } from '../../shared/ui'
import { PassModal } from '../employees/PassModal.jsx'

const CACHE_KEY = 'pass-list'

const TABS = [
  { value: 'active', label: 'Активные' },
  { value: 'deactivated', label: 'Деактивированные' },
]

const COLUMNS = [
  { key: 'name', label: 'Название', sortable: true, width: 'minmax(0, 1.2fr)' },
  { key: 'access', label: 'Доступ в', width: 'minmax(0, 1.3fr)' },
  { key: 'chevron', label: '', width: '30px' },
]

const typeBadgeStyle = { fontSize: 10.5, fontWeight: 700, color: 'var(--color-text-secondary)', background: 'var(--color-fill-active-tint)', padding: '1px 6px', borderRadius: 5, whiteSpace: 'nowrap' }

// Строки «Доступ в»: по строке на здание с перечнем помещений (или «все
// помещения»). Тот же принцип, что и в PassInfo.
function accessLines(pass) {
  const rooms = pass.rooms || []
  return (pass.buildings || []).map((b) => {
    const bRooms = rooms.filter((r) => r.building === b.id)
    const roomsText = bRooms.length === 0 ? 'все помещения' : bRooms.map((r) => r.name).join(', ')
    return { id: b.id, name: b.name, roomsText }
  })
}

export function PassListPage() {
  const isPop = useNavigationType() === 'POP'
  const savedUi = isPop ? readListCache(CACHE_KEY)?.ui : undefined
  const [tab, setTab] = useState(() => savedUi?.tab ?? 'active')
  const [search, setSearch] = useState(() => savedUi?.search ?? '')
  const debouncedSearch = useDebouncedValue(search)
  const [sort, setSort] = useState(() => savedUi?.sort ?? { key: 'created_at', dir: 'desc' })
  const [modal, setModal] = useState(null) // null | 'new'

  useEffect(() => {
    writeListCache(CACHE_KEY, { ui: { tab, search, sort } })
  }, [tab, search, sort])

  const ordering = sort.dir === 'desc' ? `-${sort.key}` : sort.key
  const { items, loading, loadingMore, hasMore, loadMore, error, refetch } = useCursorList(
    '/api/access-passes/',
    { tab, search: debouncedSearch || undefined, ordering },
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
          Пропуска
        </h1>
        <Can perm="canManageEmployees">
          <div className="ele-page-head__actions">
            <Button onClick={() => setModal('new')}>
              <span className="ele-only-desktop">+ Добавить пропуск</span>
              <span className="ele-only-mobile">+ Добавить</span>
            </Button>
          </div>
        </Can>
      </div>

      <TabBar options={TABS} value={tab} onChange={setTab} />

      <div style={{ display: 'flex' }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Поиск по названию или учётному номеру" />
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
          title={search ? 'Ничего не найдено' : tab === 'deactivated' ? 'Нет деактивированных' : 'Пока пусто'}
          description={
            search
              ? `По запросу «${search}» пропуска не найдены.`
              : tab === 'deactivated'
                ? 'Отвязанные от сотрудников пропуска будут отображаться здесь.'
                : 'Когда вы добавите пропуск, он будет отображаться здесь.'
          }
          action={search ? <Button variant="secondary" onClick={() => setSearch('')}>Сбросить фильтры</Button> : undefined}
        />
      ) : (
        <Table columns={COLUMNS} sortKey={sort.key} sortDir={sort.dir} onSort={handleSort}>
          {items.map((row) => (
            <Link key={row.id} to={`/passes/${row.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
              <TableRow columns={COLUMNS}>
                <div style={{ minWidth: 0 }}>
                  <div className="ele-clamp-2" style={{ fontWeight: 600 }}>{row.name || 'Без названия'}</div>
                  <div style={{ font: '500 12px var(--font-mono)', color: 'var(--color-text-placeholder)', marginTop: 2 }}>
                    № {row.account_number && row.account_number.trim() ? row.account_number : 'б/н'}
                  </div>
                  {row.type_vehicle || row.type_pedestrian ? (
                    <div style={{ display: 'flex', gap: 5, marginTop: 5 }}>
                      {row.type_vehicle ? <span style={typeBadgeStyle}>Авто</span> : null}
                      {row.type_pedestrian ? <span style={typeBadgeStyle}>Пеший</span> : null}
                    </div>
                  ) : null}
                </div>
                <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {accessLines(row).length === 0 ? (
                    <span style={{ color: 'var(--color-text-placeholder)', fontSize: 13 }}>—</span>
                  ) : (
                    accessLines(row).map((a) => (
                      <div key={a.id} style={{ fontSize: 12.5, color: 'var(--color-text-placeholder)' }}>
                        <span style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>{a.name}</span> — {a.roomsText}
                      </div>
                    ))
                  )}
                </div>
                <div style={{ textAlign: 'right', color: 'var(--color-border-strong)' }}>
                  <Icon name="chevron-right" size={18} strokeWidth={2} />
                </div>
              </TableRow>
            </Link>
          ))}
          <InfiniteScrollSentinel hasMore={hasMore} loading={loadingMore} onLoadMore={loadMore} />
        </Table>
      )}

      {modal ? (
        <PassModal
          onClose={() => setModal(null)}
          onDone={(saved) => {
            setModal(null)
            if (saved?.is_deactivated && tab !== 'deactivated') setTab('deactivated')
            else refetch()
          }}
        />
      ) : null}
    </div>
  )
}
