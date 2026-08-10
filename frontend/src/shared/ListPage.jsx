import { useEffect, useState } from 'react'
import { Link, useNavigationType } from 'react-router-dom'
import { Can, usePermissions } from '../app/usePermissions.js'
import { InfiniteScrollSentinel } from './InfiniteScrollSentinel.jsx'
import { useCursorList } from './hooks/useCursorList.js'
import { useDebouncedValue } from './hooks/useDebouncedValue.js'
import { useScrollRestoration } from './hooks/useScrollRestoration.js'
import { readListCache, writeListCache } from './listCache.js'
import { Button, EmptyState, FilterModal, Icon, SearchInput, Skeleton, Table, TabBar, TableRow } from './ui'

// Общий каркас списочной страницы имущества: заголовок с кнопками, вкладки
// «активные/архив», поиск, модалка фильтров, список с курсорной пагинацией,
// восстановление состояния при переходе «назад» (POP) и пустые состояния.
// Специфика раздела задаётся пропсами — поведение остаётся 1:1 с прежними
// самостоятельными страницами. Первая вкладка всегда 'active'.
//
// Пропсы:
//   title           — заголовок раздела
//   headerPerm      — право для показа блока кнопок (обёртка <Can>)
//   headerActions   — JSX кнопок раздела (Link/Button внутри .ele-page-head__actions)
//   cacheKey        — ключ кэша состояния списка (напр. 'equipment-list')
//   endpoint        — REST-эндпоинт списка (напр. '/api/equipment/')
//   tabs            — опции TabBar ([{value,label}]); первая — 'active'
//   defaultSort     — стартовая сортировка ({ key, dir })
//   emptyFilters    — начальный объект фильтров
//   filterCount     — (filters) => число активных фильтров
//   renderFilter    — ({ draft, setDraft, perms }) => node | { main, aside } для FilterModal
//   buildParams     — ({ tab, isActive, filters, search, sort, ordering }) => query-объект useCursorList
//   activeColumns   — колонки таблицы для активной вкладки
//   archiveColumns  — колонки для второй (архив/утилизировано) вкладки
//   renderRow       — (row, { tab, isActive, perms }) => содержимое ячеек без замыкающего chevron
//   rowLink         — (row) => путь на карточку
//   emptyText       — ({ search, tab, isActive }) => { title, description, resetLabel }
export function ListPage({
  title,
  headerPerm,
  headerActions,
  cacheKey,
  endpoint,
  tabs,
  defaultSort = { key: 'created_at', dir: 'desc' },
  emptyFilters,
  filterCount,
  renderFilter,
  buildParams,
  activeColumns,
  archiveColumns,
  renderRow,
  rowLink,
  emptyText,
}) {
  // Восстанавливаем состояние списка (фильтры/сортировка/поиск, подгруженные
  // страницы, прокрутку) только при переходе «назад» (POP) — например, с
  // карточки объекта. При заходе через меню (PUSH) открываем заново.
  const isPop = useNavigationType() === 'POP'
  const savedUi = isPop ? readListCache(cacheKey)?.ui : undefined
  const perms = usePermissions()
  const [tab, setTab] = useState(() => savedUi?.tab ?? 'active')
  const [filters, setFilters] = useState(() => ({ ...emptyFilters, ...(savedUi?.filters ?? {}) }))
  const [search, setSearch] = useState(() => savedUi?.search ?? '')
  const debouncedSearch = useDebouncedValue(search)
  const [sort, setSort] = useState(() => savedUi?.sort ?? defaultSort)

  useEffect(() => {
    writeListCache(cacheKey, { ui: { tab, filters, search, sort } })
  }, [cacheKey, tab, filters, search, sort])

  const isActive = tab === 'active'
  const ordering = sort.dir === 'desc' ? `-${sort.key}` : sort.key
  const { items, loading, loadingMore, hasMore, loadMore, error } = useCursorList(
    endpoint,
    buildParams({ tab, isActive, filters, search: debouncedSearch, sort, ordering }),
    { cacheKey, restore: isPop },
  )
  useScrollRestoration(cacheKey, isPop && !loading)

  const columns = isActive ? activeColumns : archiveColumns

  const handleSort = (key) => {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))
  }

  const empty = emptyText({ search, tab, isActive })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="ele-page-head">
        <h1 style={{ fontSize: 'var(--font-size-h1)', fontWeight: 600, letterSpacing: 'var(--font-h1-letter-spacing)' }}>
          {title}
        </h1>
        <Can perm={headerPerm}>
          <div className="ele-page-head__actions">{headerActions}</div>
        </Can>
      </div>

      <div className="ele-list-controls">
        <div className="ele-list-controls__tabs">
          <TabBar options={tabs} value={tab} onChange={setTab} />
        </div>
        <div className="ele-list-controls__search">
          <SearchInput value={search} onChange={setSearch} placeholder="Поиск" />
        </div>
        {isActive && renderFilter ? (
          <div className="ele-list-controls__filter">
            <FilterModal
              value={filters}
              count={filterCount(filters)}
              onApply={setFilters}
              onClear={() => setFilters(emptyFilters)}
              isDraftActive={(d) => filterCount(d) > 0}
            >
              {(draft, setDraft) => renderFilter({ draft, setDraft, perms })}
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
          title={empty.title}
          description={empty.description}
          action={
            search ? (
              <Button variant="secondary" onClick={() => setSearch('')}>
                {empty.resetLabel}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Table columns={columns} sortKey={sort.key} sortDir={sort.dir} onSort={handleSort}>
          {items.map((row) => (
            <Link key={row.id} to={rowLink(row)} style={{ color: 'inherit', textDecoration: 'none' }}>
              <TableRow columns={columns}>
                {renderRow(row, { tab, isActive, perms })}
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
