import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BackButton, Badge, Icon, Spinner, TabBar } from '../../shared/ui'
import { getAssignments } from './employeesApi.js'

// B32. Контрольный подраздел «Операции закрепления» (admin/accountant): все
// эпизоды закрепления с их статусом акцепта, фильтр по статусу.
const STATUS_TABS = [
  { value: '', label: 'Все' },
  { value: 'pending', label: 'Ожидают' },
  { value: 'accepted', label: 'Подтверждены' },
  { value: 'in_absentia', label: 'Заочные' },
  { value: 'rejected', label: 'Отклонены' },
]

const KIND_ICON = { equipment: 'tag', sim: 'radio-tower', pass: 'key-square', tool: 'wrench', transport: 'car' }

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function AssignmentsPage() {
  const [status, setStatus] = useState('')
  const [rows, setRows] = useState(null)
  const [next, setNext] = useState(null)
  const [loadingMore, setLoadingMore] = useState(false)

  useEffect(() => {
    setRows(null)
    const q = status ? `?status=${status}` : ''
    getAssignments(q).then((d) => {
      setRows(d.results || d)
      setNext(d.next || null)
    })
  }, [status])

  const loadMore = async () => {
    if (!next) return
    setLoadingMore(true)
    try {
      const url = next.replace(/^.*\/api\//, '/api/')
      const d = await getAssignments(url.replace('/api/assignments/', ''))
      setRows((prev) => [...(prev || []), ...(d.results || [])])
      setNext(d.next || null)
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <div className="ele-page">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <BackButton to="/employees" />
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Операции закрепления</h1>
      </div>
      <div style={{ fontSize: 13, color: 'var(--color-text-placeholder)', marginBottom: 16 }}>
        Статусы подтверждения сотрудниками закреплённого за ними имущества.
      </div>

      <div style={{ marginBottom: 16 }}>
        <TabBar options={STATUS_TABS} value={status} onChange={setStatus} size="control" variant="filter" />
      </div>

      {rows === null ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner /></div>
      ) : rows.length === 0 ? (
        <div style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>Операций закрепления не найдено.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.map((a) => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12, flexWrap: 'wrap' }}>
              <Icon name={KIND_ICON[a.object_kind] || 'tag'} size={18} strokeWidth={2} style={{ color: 'var(--color-text-muted)', flex: 'none' }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {a.object_label || a.object_kind_display}
                  {a.object_kind === 'tool' && a.return_quantity ? ` · ${a.return_quantity} шт.` : ''}
                </div>
                <Link to={`/employees/${a.employee_id}`} style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>{a.employee_name}</Link>
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)', flex: 'none' }}>{fmtDate(a.assigned_at)}</div>
              <Badge>{a.status_display}</Badge>
            </div>
          ))}
          {next ? (
            <button type="button" onClick={loadMore} disabled={loadingMore} style={{ marginTop: 4, padding: '10px', border: '1px solid var(--color-border)', borderRadius: 10, background: 'var(--color-surface)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5 }}>
              {loadingMore ? 'Загрузка…' : 'Показать ещё'}
            </button>
          ) : null}
        </div>
      )}
    </div>
  )
}
