import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BackButton, FilterModal, Icon, MultiSelectList, SearchInput, Skeleton } from '../../shared/ui'
import { InfiniteScrollSentinel } from '../../shared/InfiniteScrollSentinel.jsx'
import { useCursorList } from '../../shared/hooks/useCursorList.js'
import { useDebouncedValue } from '../../shared/hooks/useDebouncedValue.js'
import { csvParam } from '../../shared/filterParams.js'
import { EmployeeMultiPicker } from '../../shared/EmployeeMultiPicker.jsx'
import { AcceptanceOverlay } from '../../shared/AcceptanceIcon.jsx'

// B32. Контрольный подраздел «Операции закрепления» (admin/accountant): все
// эпизоды закрепления с их статусом акцепта; поиск + фильтры (статус, сотрудник).
const STATUS_OPTIONS = [
  { value: 'pending', label: 'Ожидает подтверждения' },
  { value: 'in_absentia', label: 'Заочно' },
  { value: 'accepted', label: 'Подтверждено' },
  { value: 'rejected', label: 'Отклонено' },
  { value: 'cancelled', label: 'Отменено' },
]
const KIND_ICON = { equipment: 'tag', sim: 'radio-tower', pass: 'key-square', tool: 'wrench', transport: 'car' }
const OBJ_ROUTE = { equipment: 'equipment', tool: 'tools', sim: 'sim-cards', pass: 'passes', transport: 'transport' }
const EMPTY_FILTERS = { statuses: [], employees: [] }
const countActive = (f) => f.statuses.length + f.employees.length

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function AssignmentsPage() {
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search)
  const [filters, setFilters] = useState(EMPTY_FILTERS)

  const { items, loading, loadingMore, hasMore, loadMore, error } = useCursorList(
    '/api/assignments/',
    {
      search: debouncedSearch || undefined,
      status: csvParam(filters.statuses),
      employee: csvParam(filters.employees.map((e) => e.id)),
    },
    { restore: false },
  )

  return (
    <div className="ele-page" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <BackButton to="/employees" />
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Операции закрепления</h1>
      </div>

      <div className="ele-list-controls">
        <div className="ele-list-controls__search">
          <SearchInput value={search} onChange={setSearch} placeholder="Поиск по сотруднику и объекту" />
        </div>
        <div className="ele-list-controls__filter">
          <FilterModal
            value={filters}
            count={countActive(filters)}
            onApply={setFilters}
            onClear={() => setFilters(EMPTY_FILTERS)}
            isDraftActive={(d) => countActive(d) > 0}
          >
            {(draft, setDraft) => ({
              main: (
                <div>
                  <div className="ele-filter-section__title">Статус</div>
                  <MultiSelectList
                    options={STATUS_OPTIONS}
                    selected={draft.statuses}
                    onToggle={(v) =>
                      setDraft((d) => ({
                        ...d,
                        statuses: d.statuses.includes(v) ? d.statuses.filter((s) => s !== v) : [...d.statuses, v],
                      }))
                    }
                  />
                </div>
              ),
              aside: (
                <div>
                  <div className="ele-filter-section__title">Сотрудник</div>
                  <EmployeeMultiPicker value={draft.employees} onChange={(e) => setDraft((d) => ({ ...d, employees: e }))} />
                </div>
              ),
            })}
          </FilterModal>
        </div>
      </div>

      {error ? (
        <div style={{ color: 'var(--color-error)', fontSize: 14 }}>Не удалось загрузить список.</div>
      ) : loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Skeleton height={66} /><Skeleton height={66} /><Skeleton height={66} />
        </div>
      ) : items.length === 0 ? (
        <div style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>Операций закрепления не найдено.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map((a) => (
            <div key={a.id} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12 }}>
              {/* 1 строка — дата и время с иконкой календаря */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--color-text-placeholder)', font: '500 12px var(--font-mono)' }}>
                <Icon name="calendar-clock" size={13} strokeWidth={2} style={{ flex: 'none' }} />
                {fmtDate(a.assigned_at)}
              </div>
              {/* 2 строка — объект (иконка со статусом в углу) + сотрудник, оба кликабельны */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ position: 'relative', flex: 'none' }}>
                  <span style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--color-fill-input)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name={KIND_ICON[a.object_kind] || 'tag'} size={18} strokeWidth={2} style={{ color: 'var(--color-text-muted)' }} />
                  </span>
                  <AcceptanceOverlay status={a.status} size={16} />
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <Link to={`/${OBJ_ROUTE[a.object_kind]}/${a.object_id}`} style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {a.object_label || a.object_kind_display}
                    {a.object_kind === 'tool' && a.return_quantity ? ` · ${a.return_quantity} шт.` : ''}
                  </Link>
                  <Link to={`/employees/${a.employee_id}`} style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>{a.employee_name}</Link>
                </div>
              </div>
            </div>
          ))}
          <InfiniteScrollSentinel hasMore={hasMore} loading={loadingMore} onLoadMore={loadMore} />
        </div>
      )}
    </div>
  )
}
