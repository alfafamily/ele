import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Can } from '../../app/usePermissions.js'
import { InfiniteScrollSentinel } from '../../shared/InfiniteScrollSentinel.jsx'
import { useCursorList } from '../../shared/hooks/useCursorList.js'
import { useDebouncedValue } from '../../shared/hooks/useDebouncedValue.js'
import { Button, EmptyState, SearchInput, Skeleton, Table, TabBar, TableRow } from '../../shared/ui'

const TABS = [
  { value: 'active', label: 'Активные' },
  { value: 'archive', label: 'Архив' },
]
const FILTERS = [
  { value: 'all', label: 'Все' },
  { value: 'occupied', label: 'Занятые' },
  { value: 'free', label: 'Свободные' },
]

const ACTIVE_COLUMNS = [
  { key: 'name', label: 'Наименование', sortable: true, width: 'minmax(0, 1.4fr)' },
  { key: 'equipment__inventory_number', label: 'Закреплено за', sortable: true, width: 'minmax(0, 1fr)' },
  { key: 'chevron', label: '', width: '30px' },
]
const ARCHIVE_COLUMNS = [
  { key: 'name', label: 'Наименование', width: 'minmax(0, 1.4fr)' },
  { key: 'retired_at', label: 'Дата утилизации', width: '170px' },
  { key: 'chevron', label: '', width: '30px' },
]

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('ru-RU')
}

export function LicenseListPage() {
  const [tab, setTab] = useState('active')
  const [status, setStatus] = useState('all')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search)
  const [sort, setSort] = useState({ key: 'created_at', dir: 'desc' })

  const ordering = sort.dir === 'desc' ? `-${sort.key}` : sort.key
  const { items, loading, loadingMore, hasMore, loadMore, error } = useCursorList('/api/licenses/', {
    tab,
    status: tab === 'active' ? status : undefined,
    search: debouncedSearch || undefined,
    ordering,
  })

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
              <Button variant="secondary" style={{ whiteSpace: 'normal', height: 'auto', minHeight: 'var(--control-height)', lineHeight: 1.15, padding: '6px 20px' }}>
                Настроить типы
              </Button>
            </Link>
            <Link to="/licenses/new">
              <Button style={{ height: 'auto', minHeight: 'var(--control-height)' }}>
                <span className="ele-only-desktop">+ Добавить лицензию</span>
                <span className="ele-only-mobile">+ Добавить</span>
              </Button>
            </Link>
          </div>
        </Can>
      </div>

      <TabBar options={TABS} value={tab} onChange={setTab} />

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Поиск по наименованию, типу или номеру оборудования" />
        {tab === 'active' ? <TabBar options={FILTERS} value={status} onChange={setStatus} size="control" variant="filter" /> : null}
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
          title={search ? 'Ничего не найдено' : tab === 'archive' ? 'В архиве пусто' : 'Пока пусто'}
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
                {/* Наименование в 2 строки + Тип лицензии ниже */}
                <div style={{ minWidth: 0 }}>
                  <div className="ele-clamp-2" style={{ fontWeight: 600 }}>{row.name}</div>
                  <div style={{ color: 'var(--color-text-placeholder)', fontSize: 12.5, marginTop: 2 }}>{row.license_type_name}</div>
                </div>
                {tab === 'active' ? (
                  // Закреплено за: наименование оборудования в 2 строки + учётный номер
                  <div style={{ minWidth: 0 }}>
                    {row.equipment_detail ? (
                      <>
                        <div className="ele-clamp-2">{row.equipment_detail.type_and_model}</div>
                        <div style={{ font: '500 12px var(--font-mono)', color: 'var(--color-text-placeholder)', marginTop: 2 }}>{row.equipment_detail.inventory_number}</div>
                      </>
                    ) : (
                      <span style={{ color: 'var(--color-text-placeholder)' }}>Не привязана</span>
                    )}
                  </div>
                ) : (
                  <div style={{ color: 'var(--color-text-placeholder)', font: '500 13px var(--font-mono)' }}>{formatDate(row.retired_at)}</div>
                )}
                <div style={{ textAlign: 'right', color: 'var(--color-border-strong)' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 6l6 6-6 6" />
                  </svg>
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
