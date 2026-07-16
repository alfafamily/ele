import { useEffect, useState } from 'react'
import { Link, useNavigationType } from 'react-router-dom'
import { Can } from '../../app/usePermissions.js'
import { InfiniteScrollSentinel } from '../../shared/InfiniteScrollSentinel.jsx'
import { useCursorList } from '../../shared/hooks/useCursorList.js'
import { useDebouncedValue } from '../../shared/hooks/useDebouncedValue.js'
import { useMediaQuery } from '../../shared/hooks/useMediaQuery.js'
import { useScrollRestoration } from '../../shared/hooks/useScrollRestoration.js'
import { readListCache, writeListCache } from '../../shared/listCache.js'
import { Button, EmptyState, Icon, SearchInput, Skeleton, Table, TabBar, TableRow } from '../../shared/ui'
import { SimCardModal } from '../employees/SimCardModal.jsx'

const CACHE_KEY = 'sim-list'

const TABS = [
  { value: 'active', label: 'Активные' },
  { value: 'deactivated', label: 'Неиспользуемые' },
  { value: 'utilized', label: 'Утилизировано' },
]

const DESKTOP_COLUMNS = [
  { key: 'phone_number', label: 'Номер', sortable: true, width: 'minmax(0, 1.3fr)' },
  { key: 'network_operator', label: 'Оператор', sortable: true, width: 'minmax(0, 1fr)' },
  { key: 'provider', label: 'Поставщик', sortable: true, width: 'minmax(0, 1fr)' },
  { key: 'chevron', label: '', width: '30px' },
]
const MOBILE_COLUMNS = [
  { key: 'phone_number', label: 'Номер', sortable: true, width: 'minmax(0, 1.2fr)' },
  { key: 'network_operator', label: 'Оператор / Поставщик', width: 'minmax(0, 1fr)' },
]

// Плашка типа (SIM / E-SIM) перед номером — единая чёрная схема, как в SimCardInfo.
function TypeBadge({ label }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: 'var(--color-text-primary)', padding: '1px 7px', borderRadius: 5, whiteSpace: 'nowrap', flex: 'none' }}>
      {label}
    </span>
  )
}

export function SimListPage() {
  const isPop = useNavigationType() === 'POP'
  const savedUi = isPop ? readListCache(CACHE_KEY)?.ui : undefined
  const [tab, setTab] = useState(() => savedUi?.tab ?? 'active')
  const [search, setSearch] = useState(() => savedUi?.search ?? '')
  const debouncedSearch = useDebouncedValue(search)
  const [sort, setSort] = useState(() => savedUi?.sort ?? { key: 'created_at', dir: 'desc' })
  const [modal, setModal] = useState(null) // null | 'new'
  const isMobile = useMediaQuery('(max-width: 768px)')
  const columns = isMobile ? MOBILE_COLUMNS : DESKTOP_COLUMNS

  useEffect(() => {
    writeListCache(CACHE_KEY, { ui: { tab, search, sort } })
  }, [tab, search, sort])

  const ordering = sort.dir === 'desc' ? `-${sort.key}` : sort.key
  const { items, loading, loadingMore, hasMore, loadMore, error, refetch } = useCursorList(
    '/api/sim-cards/',
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
          Корпоративная связь
        </h1>
        <Can perm="canManageEmployees">
          <div className="ele-page-head__actions">
            <Button onClick={() => setModal('new')}>
              <span className="ele-only-desktop">+ Добавить SIM-карту</span>
              <span className="ele-only-mobile">+ Добавить</span>
            </Button>
          </div>
        </Can>
      </div>

      <TabBar options={TABS} value={tab} onChange={setTab} />

      <div style={{ display: 'flex' }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Поиск по номеру, оператору или поставщику" />
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
          title={search ? 'Ничего не найдено' : tab === 'utilized' ? 'Нет утилизированных' : tab === 'deactivated' ? 'Нет неиспользуемых' : 'Пока пусто'}
          description={
            search
              ? `По запросу «${search}» SIM-карты не найдены.`
              : tab === 'utilized'
                ? 'Утилизированные SIM-карты будут отображаться здесь.'
                : tab === 'deactivated'
                  ? 'Отвязанные от сотрудников SIM-карты будут отображаться здесь.'
                  : 'Когда вы добавите SIM-карту, она будет отображаться здесь.'
          }
          action={search ? <Button variant="secondary" onClick={() => setSearch('')}>Сбросить фильтры</Button> : undefined}
        />
      ) : (
        <Table columns={columns} sortKey={sort.key} sortDir={sort.dir} onSort={handleSort}>
          {items.map((row) => (
            <Link key={row.id} to={`/sim-cards/${row.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
              <TableRow columns={columns}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <TypeBadge label={row.sim_type_display} />
                  <span style={{ font: '600 13.5px var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.phone_number}</span>
                </div>
                {isMobile ? (
                  <div style={{ color: 'var(--color-text-muted)', fontSize: 12.5, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {[row.network_operator, row.provider].filter(Boolean).join(' / ') || '—'}
                  </div>
                ) : (
                  <>
                    <div style={{ color: 'var(--color-text-muted)', fontSize: 13, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.network_operator || '—'}</div>
                    <div style={{ color: 'var(--color-text-muted)', fontSize: 13, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.provider || '—'}</div>
                    <div style={{ textAlign: 'right', color: 'var(--color-border-strong)' }}>
                      <Icon name="chevron-right" size={18} strokeWidth={2} />
                    </div>
                  </>
                )}
              </TableRow>
            </Link>
          ))}
          <InfiniteScrollSentinel hasMore={hasMore} loading={loadingMore} onLoadMore={loadMore} />
        </Table>
      )}

      {modal ? (
        <SimCardModal
          onClose={() => setModal(null)}
          onDone={(saved) => {
            setModal(null)
            // Новая SIM без сотрудника попадёт в «Деактивированные» — переключим
            // вкладку, чтобы результат был виден.
            if (saved?.is_deactivated && tab !== 'deactivated') setTab('deactivated')
            else refetch()
          }}
        />
      ) : null}
    </div>
  )
}
