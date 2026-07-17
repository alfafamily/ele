import { useEffect, useState } from 'react'
import { Link, useNavigationType } from 'react-router-dom'
import { Can } from '../../app/usePermissions.js'
import { InfiniteScrollSentinel } from '../../shared/InfiniteScrollSentinel.jsx'
import { useCursorList } from '../../shared/hooks/useCursorList.js'
import { useDebouncedValue } from '../../shared/hooks/useDebouncedValue.js'
import { useMediaQuery } from '../../shared/hooks/useMediaQuery.js'
import { useScrollRestoration } from '../../shared/hooks/useScrollRestoration.js'
import { readListCache, writeListCache } from '../../shared/listCache.js'
import { nameInitials } from '../../shared/employeeName.js'
import { Button, EmptyState, Icon, SearchInput, Skeleton, StatusPill, Table, TabBar, TableRow } from '../../shared/ui'

const CACHE_KEY = 'employee-list'

const TABS = [
  { value: 'working', label: 'Трудоустроены' },
  { value: 'terminated', label: 'Уволены' },
]

// Desktop — отдельные колонки ФИО/Должность/Отдел; на мобильных они схлопываются
// в одну колонку «Сотрудник» (ФИО + Должность + Отдел), остальные — как есть.
const DESKTOP_COLUMNS = [
  { key: 'last_name', label: 'ФИО', sortable: true, width: '1fr' },
  { key: 'position', label: 'Должность', width: '190px' },
  { key: 'department', label: 'Отдел', width: '160px' },
  { key: 'equipment', label: 'Оборудование', width: '140px' },
  { key: 'status', label: 'Статус', width: '120px' },
  { key: 'chevron', label: '', width: '30px' },
]
const MOBILE_COLUMNS = [
  { key: 'last_name', label: 'Сотрудник', sortable: true, width: 'minmax(0, 1fr)' },
  { key: 'equipment', label: 'Оборуд.', width: '84px' },
]

function avatarNode(row) {
  return (
    <span
      style={{
        width: 34,
        height: 34,
        flex: 'none',
        borderRadius: '50%',
        background: 'var(--color-fill-active-tint)',
        color: 'var(--color-text-muted)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 12,
        fontWeight: 600,
        overflow: 'hidden',
      }}
    >
      {row.avatar ? <img src={row.avatar.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : nameInitials(row.full_name)}
    </span>
  )
}

export function EmployeeListPage() {
  // Восстанавливаем состояние списка (поиск/сортировка, подгруженные страницы,
  // прокрутку) только при переходе «назад» (POP) — например, с карточки
  // сотрудника; при заходе через меню (PUSH) открываем заново.
  const isPop = useNavigationType() === 'POP'
  const savedUi = isPop ? readListCache(CACHE_KEY)?.ui : undefined
  const [tab, setTab] = useState(() => savedUi?.tab ?? 'working')
  const [search, setSearch] = useState(() => savedUi?.search ?? '')
  const debouncedSearch = useDebouncedValue(search)
  const [sortDir, setSortDir] = useState(() => savedUi?.sortDir ?? 'asc')
  const isMobile = useMediaQuery('(max-width: 768px)')
  const columns = isMobile ? MOBILE_COLUMNS : DESKTOP_COLUMNS

  useEffect(() => {
    writeListCache(CACHE_KEY, { ui: { tab, search, sortDir } })
  }, [tab, search, sortDir])

  const ordering = sortDir === 'desc' ? '-last_name' : 'last_name'
  const { items, loading, loadingMore, hasMore, loadMore, error } = useCursorList(
    '/api/employees/',
    {
      employment: tab,
      search: debouncedSearch || undefined,
      ordering,
    },
    { cacheKey: CACHE_KEY, restore: isPop },
  )
  useScrollRestoration(CACHE_KEY, isPop && !loading)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="ele-page-head">
        <h1 style={{ fontSize: 'var(--font-size-h1)', fontWeight: 600, letterSpacing: 'var(--font-h1-letter-spacing)' }}>
          Сотрудники
        </h1>
        <Can perm="canManageEmployees">
          <div className="ele-page-head__actions">
            <Link to="/employees/new">
              <Button title="Добавить сотрудника" aria-label="Добавить сотрудника">
                <span className="ele-only-desktop">+ Добавить сотрудника</span>
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
          title={search ? 'Ничего не найдено' : tab === 'terminated' ? 'Нет уволенных' : 'Пока пусто'}
          description={
            search
              ? `По запросу «${search}» сотрудники не найдены.`
              : tab === 'terminated'
                ? 'Уволенные сотрудники будут отображаться здесь.'
                : 'Когда вы добавите сотрудника, он будет отображаться здесь.'
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
        <Table columns={columns} sortKey="last_name" sortDir={sortDir} onSort={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}>
          {items.map((row) => (
            <Link key={row.id} to={`/employees/${row.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
              <TableRow columns={columns}>
                {isMobile ? (
                  // 2 колонки: «Сотрудник» (ФИО в 2 строки · должность/отдел · статус) и «Оборудование»
                  <>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11, minWidth: 0 }}>
                      {avatarNode(row)}
                      <div style={{ minWidth: 0 }}>
                        <div className="ele-clamp-2" style={{ fontWeight: 600 }}>{row.full_name}</div>
                        <div style={{ color: 'var(--color-text-muted)', fontSize: 12, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {[row.position, row.department].filter(Boolean).join(' · ') || '—'}
                        </div>
                        <div style={{ marginTop: 6 }}>
                          <StatusPill variant={row.is_employed ? 'assigned' : 'archived'}>{row.is_employed ? 'Работает' : 'Уволен'}</StatusPill>
                        </div>
                      </div>
                    </div>
                    <div style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>{row.equipment_count} ед.</div>
                  </>
                ) : (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
                      {avatarNode(row)}
                      <span style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.full_name}</span>
                    </div>
                    <div>{row.position || '—'}</div>
                    <div style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>{row.department || '—'}</div>
                    <div style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>{row.equipment_count} ед.</div>
                    <div>
                      <StatusPill variant={row.is_employed ? 'assigned' : 'archived'}>{row.is_employed ? 'Работает' : 'Уволен'}</StatusPill>
                    </div>
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
    </div>
  )
}
