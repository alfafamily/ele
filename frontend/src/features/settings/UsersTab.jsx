import { useState } from 'react'
import { InfiniteScrollSentinel } from '../../shared/InfiniteScrollSentinel.jsx'
import { useCursorList } from '../../shared/hooks/useCursorList.js'
import { roleLabel } from '../../shared/roles.js'
import { Banner, Button, Skeleton, StatusPill, Table, TableRow } from '../../shared/ui'
import { DeactivateUserModal } from './DeactivateUserModal.jsx'
import { EditUserModal } from './EditUserModal.jsx'
import { InviteModal } from './InviteModal.jsx'
import { activateUser } from './settingsApi.js'

const COLUMNS = [
  { key: 'email', label: 'Пользователь', width: '1fr' },
  { key: 'employee', label: 'Сотрудник', width: '240px' },
  { key: 'status', label: 'Статус', width: '130px' },
  { key: 'action', label: '', width: '40px' },
]

const STATUS_LABEL = { active: 'Активен', invited: 'Приглашён', deactivated: 'Деактивирован' }
const ROLE_PILL_VARIANT = { admin: 'role-admin', accountant: 'free', employee: 'archived' }

export function UsersTab() {
  const { items, loading, loadingMore, hasMore, loadMore, refetch, error } = useCursorList('/api/users/', {})
  const [showInvite, setShowInvite] = useState(false)
  const [deactivateTarget, setDeactivateTarget] = useState(null)
  const [editTarget, setEditTarget] = useState(null)
  const [activatingId, setActivatingId] = useState(null)

  const onActivate = async (e, user) => {
    e.stopPropagation()
    setActivatingId(user.id)
    try {
      await activateUser(user.id)
      refetch()
    } finally {
      setActivatingId(null)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 19, fontWeight: 600 }}>Пользователи</div>
          <div style={{ fontSize: 13, color: 'var(--color-text-placeholder)', marginTop: 2 }}>Доступ к системе и роли</div>
        </div>
        <Button onClick={() => setShowInvite(true)}>+ Пригласить пользователя</Button>
      </div>

      {error ? (
        <Banner variant="error">Не удалось загрузить список пользователей.</Banner>
      ) : loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Skeleton height={52} />
          <Skeleton height={52} />
        </div>
      ) : (
        <Table columns={COLUMNS}>
          {items.map((u) => (
            <TableRow key={u.id} columns={COLUMNS} onClick={() => setEditTarget(u)} style={{ cursor: 'pointer' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.email}</div>
                <div style={{ marginTop: 4 }}>
                  <StatusPill variant={ROLE_PILL_VARIANT[u.role]}>
                    {roleLabel(u.role)}
                    {u.is_observer ? ' · Наблюдатель' : ''}
                  </StatusPill>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                {u.employee_name ? (
                  <>
                    <span
                      style={{
                        width: 30,
                        height: 30,
                        flex: 'none',
                        borderRadius: '50%',
                        background: 'var(--color-fill-active-tint)',
                        color: 'var(--color-text-muted)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 11,
                        fontWeight: 600,
                      }}
                    >
                      {u.employee_name.slice(0, 2).toUpperCase()}
                    </span>
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.employee_name}</span>
                  </>
                ) : (
                  <span style={{ color: 'var(--color-text-placeholder)' }}>—</span>
                )}
              </div>
              <div>
                <span
                  style={{
                    fontSize: 12.5,
                    fontWeight: 500,
                    color: u.status === 'active' ? 'var(--color-success)' : u.status === 'invited' ? 'var(--color-warning)' : 'var(--color-text-placeholder)',
                  }}
                >
                  {STATUS_LABEL[u.status]}
                </span>
              </div>
              <div style={{ textAlign: 'right' }}>
                {u.status !== 'deactivated' ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setDeactivateTarget(u)
                    }}
                    style={{
                      border: 'none',
                      background: 'none',
                      color: 'var(--color-text-muted)',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      padding: 4,
                    }}
                    title="Деактивировать пользователя"
                    aria-label="Деактивировать пользователя"
                  >
                    {/* Иконка «power» (вкл/выкл) — понятнее, чем «…»: действие именно деактивация */}
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 4v8" />
                      <path d="M7.5 7a7 7 0 1 0 9 0" />
                    </svg>
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={activatingId === u.id}
                    onClick={(e) => onActivate(e, u)}
                    style={{
                      border: 'none',
                      background: 'none',
                      color: 'var(--color-success)',
                      cursor: activatingId === u.id ? 'default' : 'pointer',
                      display: 'inline-flex',
                      padding: 4,
                    }}
                    title="Активировать пользователя"
                    aria-label="Активировать пользователя"
                  >
                    {/* Та же «power»-иконка, но в success-цвете — обратное действие: включить */}
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 4v8" />
                      <path d="M7.5 7a7 7 0 1 0 9 0" />
                    </svg>
                  </button>
                )}
              </div>
            </TableRow>
          ))}
          <InfiniteScrollSentinel hasMore={hasMore} loading={loadingMore} onLoadMore={loadMore} />
        </Table>
      )}

      {showInvite ? (
        <InviteModal
          onClose={() => setShowInvite(false)}
          onInvited={() => {
            setShowInvite(false)
            refetch()
          }}
        />
      ) : null}
      {deactivateTarget ? (
        <DeactivateUserModal
          user={deactivateTarget}
          onClose={() => setDeactivateTarget(null)}
          onDone={() => {
            setDeactivateTarget(null)
            refetch()
          }}
        />
      ) : null}
      {editTarget ? (
        <EditUserModal
          user={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            setEditTarget(null)
            refetch()
          }}
        />
      ) : null}
    </div>
  )
}
