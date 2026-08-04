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
import { Tooltip } from '../../shared/Tooltip.jsx'
import { ReportsMenu } from '../reports/ReportsMenu.jsx'
import { Button, EmptyState, Icon, SearchInput, Skeleton, Table, TabBar, TableRow } from '../../shared/ui'

const CACHE_KEY = 'employee-list'

const TABS = [
  { value: 'working', label: 'Трудоустроены' },
  { value: 'terminated', label: 'Уволены' },
]

// Desktop — отдельные колонки ФИО/Должность/Отдел; на мобильных они схлопываются
// в одну колонку «Сотрудник» (ФИО + Должность + Отдел), остальные — как есть.
const DESKTOP_COLUMNS = [
  { key: 'last_name', label: 'ФИО', sortable: true, width: '1fr' },
  { key: 'position', label: 'Должность', width: '180px' },
  { key: 'department', label: 'Отдел', width: '150px' },
  { key: 'consent', label: 'Согласие ПДн', sortable: true, width: '220px' },
  { key: 'chevron', label: '', width: '30px' },
]
const MOBILE_COLUMNS = [
  { key: 'last_name', label: 'Сотрудник', sortable: true, width: 'minmax(0, 1fr)' },
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
        color: 'var(--color-text-secondary)',
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

// B65. Статус согласия на обработку ПДн в отдельной колонке списка: цветная
// иконка + короткая подпись. self — выразил сам сотрудник (зелёная); operator —
// отметил ответственный (жёлтая); none — не получено/не указано (красная).
// Полная формулировка — в тултипе. У обезличенных не показываем (их ПДн удалены,
// как и блок «Согласие» на карточке).
const CONSENT_META = {
  self: { color: 'var(--color-success)', text: 'Получено от сотрудника', title: 'Сотрудник выразил согласие на сбор и обработку ПДн' },
  operator: { color: 'var(--color-warning)', text: 'Подтверждено оператором', title: 'Ответственный сотрудник отметил, что согласие сотрудника на сбор и обработку ПДн получено' },
  none: { color: 'var(--color-error)', text: 'Не получено', title: 'Согласие не получено от сотрудника или не указано' },
}

function consentCell(row) {
  if (row.is_anonymized) return null
  const meta = CONSENT_META[row.consent_status] || CONSENT_META.none
  return (
    <Tooltip
      label={meta.title}
      role="img"
      aria-label={meta.title}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0, maxWidth: '100%', color: meta.color }}
    >
      <Icon name="clipboard-pen-line" size={16} strokeWidth={2} style={{ flex: 'none' }} />
      {/* Текст — в едином стиле с колонкой «Должность» (цвет только у иконки). */}
      <span style={{ color: 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {meta.text}
      </span>
    </Tooltip>
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
  // key: 'last_name' | 'consent'. Согласие ПДн — по возрастанию «Не получено →
  // Отмечено ответственным → Получено от сотрудника» (consent_rank 0→2 на бэке).
  const [sort, setSort] = useState(() => savedUi?.sort ?? { key: 'last_name', dir: 'asc' })
  const isMobile = useMediaQuery('(max-width: 768px)')
  const columns = isMobile ? MOBILE_COLUMNS : DESKTOP_COLUMNS

  const handleSort = (key) => {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))
  }

  useEffect(() => {
    writeListCache(CACHE_KEY, { ui: { tab, search, sort } })
  }, [tab, search, sort])

  // Для «Согласия» добавляем last_name вторичным ключом — стабильный порядок
  // внутри одного статуса (и корректная курсорная пагинация).
  const dirPrefix = sort.dir === 'desc' ? '-' : ''
  const ordering = sort.key === 'consent' ? `${dirPrefix}consent_rank,last_name` : `${dirPrefix}last_name`
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
        <div className="ele-page-head__actions" style={{ display: 'flex', gap: 8 }}>
          <Can perm="canViewReports">
            <ReportsMenu items={[{ label: 'Отчёт по имуществу у сотрудников', to: '/employees/reports/property' }]} />
          </Can>
          <Can perm="canManageEmployees">
            <Link to="/employees/assignments">
              <Button variant="secondary" title="Операции закрепления" aria-label="Операции закрепления">
                <Icon className="ele-only-desktop" name="circle-check" size={18} strokeWidth={2.2} />
                <span className="ele-only-desktop">Операции закрепления</span>
                <Icon className="ele-only-mobile" name="circle-check" size={22} strokeWidth={2.4} />
              </Button>
            </Link>
            <Link to="/employees/new">
              <Button title="Добавить сотрудника" aria-label="Добавить сотрудника">
                <Icon className="ele-only-desktop" name="plus" size={18} strokeWidth={2.2} />
                <span className="ele-only-desktop">Добавить сотрудника</span>
                <Icon className="ele-only-mobile" name="plus" size={22} strokeWidth={2.4} />
              </Button>
            </Link>
          </Can>
        </div>
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
        <Table columns={columns} sortKey={sort.key} sortDir={sort.dir} onSort={handleSort}>
          {items.map((row) => (
            <Link key={row.id} to={`/employees/${row.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
              <TableRow columns={columns}>
                {isMobile ? (
                  // «Сотрудник»: ФИО в 2 строки · должность/отдел · согласие ПДн
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11, minWidth: 0 }}>
                    {avatarNode(row)}
                    <div style={{ minWidth: 0 }}>
                      <div className="ele-clamp-2" style={{ fontWeight: 600 }}>{row.full_name}</div>
                      <div style={{ color: 'var(--color-text-muted)', fontSize: 12, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {[row.position, row.department].filter(Boolean).join(' · ') || '—'}
                      </div>
                      {row.is_anonymized ? null : <div style={{ marginTop: 4 }}>{consentCell(row)}</div>}
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
                      {avatarNode(row)}
                      <span style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.full_name}</span>
                    </div>
                    <div className="ele-clamp-2">{row.position || '—'}</div>
                    <div className="ele-clamp-2" style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>{row.department || '—'}</div>
                    <div style={{ minWidth: 0 }}>{consentCell(row)}</div>
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
