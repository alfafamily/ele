import { useState } from 'react'
import { InfiniteScrollSentinel } from '../../shared/InfiniteScrollSentinel.jsx'
import { useCursorList } from '../../shared/hooks/useCursorList.js'
import { useDebouncedValue } from '../../shared/hooks/useDebouncedValue.js'
import { useMediaQuery } from '../../shared/hooks/useMediaQuery.js'
import { roleLabel } from '../../shared/roles.js'
import { nameInitials } from '../../shared/employeeName.js'
import { Banner, Button, Icon, SearchInput, Skeleton, StatusPill, Table, TableRow } from '../../shared/ui'
import { DeactivateUserModal } from './DeactivateUserModal.jsx'
import { EditUserModal } from './EditUserModal.jsx'
import { InviteModal } from './InviteModal.jsx'
import { activateUser } from './settingsApi.js'

const DESKTOP_COLUMNS = [
  { key: 'email', label: 'Пользователь', width: '1fr' },
  { key: 'employee', label: 'Сотрудник', width: '240px' },
  { key: 'status', label: 'Статус', width: '130px' },
  { key: 'action', label: '', width: '40px' },
]
// Мобильная раскладка: без принудительного скролла — колонки ужимаются, контент
// обрезается многоточием в их границах. Статус вынесен в цвет кнопки-действия.
const MOBILE_COLUMNS = [
  { key: 'email', label: 'Пользователь', width: 'minmax(0, 1.3fr)' },
  { key: 'employee', label: 'Сотрудник', width: 'minmax(0, 1fr)' },
  { key: 'action', label: '', width: '46px' },
]

const STATUS_LABEL = { active: 'Активен', invited: 'Приглашён', deactivated: 'Деактивирован' }
const ROLE_PILL_VARIANT = { admin: 'role-admin', accountant: 'free', maintenance: 'assigned', employee: 'archived' }

function Avatar({ user }) {
  return (
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
        overflow: 'hidden',
      }}
    >
      {user.employee_avatar ? (
        <img src={user.employee_avatar.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        nameInitials(user.employee_name)
      )}
    </span>
  )
}

export function UsersTab() {
  const isMobile = useMediaQuery('(max-width: 768px)')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search)
  const { items, loading, loadingMore, hasMore, loadMore, refetch, error } = useCursorList('/api/users/', {
    search: debouncedSearch || undefined,
  })
  const [showInvite, setShowInvite] = useState(false)
  const [deactivateTarget, setDeactivateTarget] = useState(null)
  const [editTarget, setEditTarget] = useState(null)
  const [activatingId, setActivatingId] = useState(null)

  const columns = isMobile ? MOBILE_COLUMNS : DESKTOP_COLUMNS

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

  // Кнопка-статус: цвет отражает текущее состояние (активен — зелёная, деактивирован
  // — красная); клик переключает (деактивация через модалку-подтверждение).
  const statusButton = (u) => {
    const active = u.status !== 'deactivated'
    return (
      <button
        type="button"
        disabled={!active && activatingId === u.id}
        onClick={(e) => {
          if (active) {
            e.stopPropagation()
            setDeactivateTarget(u)
          } else {
            onActivate(e, u)
          }
        }}
        style={{
          border: 'none',
          background: 'none',
          color: active ? 'var(--color-success)' : 'var(--color-error)',
          cursor: !active && activatingId === u.id ? 'default' : 'pointer',
          display: 'inline-flex',
          padding: 4,
        }}
        title={active ? 'Деактивировать пользователя' : 'Активировать пользователя'}
        aria-label={active ? 'Деактивировать пользователя' : 'Активировать пользователя'}
      >
        <Icon name="power" size={18} />
      </button>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16 }}>
        <SearchInput value={search} onChange={setSearch} placeholder={isMobile ? 'Поиск' : 'Поиск по имени, фамилии, почте'} />
        <Button
          onClick={() => setShowInvite(true)}
          title="Пригласить пользователя"
          aria-label="Пригласить пользователя"
          style={isMobile ? { width: 44, minWidth: 44, padding: 0, flex: 'none' } : { flex: 'none' }}
        >
          {isMobile ? <Icon name="plus" size={22} strokeWidth={2.4} /> : <><Icon name="plus" size={18} strokeWidth={2.2} />Пригласить пользователя</>}
        </Button>
      </div>

      {error ? (
        <Banner variant="error">Не удалось загрузить список пользователей.</Banner>
      ) : loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Skeleton height={52} />
          <Skeleton height={52} />
        </div>
      ) : items.length === 0 ? (
        <div style={{ fontSize: 13.5, color: 'var(--color-text-muted)', padding: '20px 4px' }}>
          {search ? 'Пользователи не найдены.' : 'Пользователей пока нет.'}
        </div>
      ) : (
        <Table columns={columns} fit={isMobile}>
          {items.map((u) => (
            <TableRow key={u.id} columns={columns} onClick={() => setEditTarget(u)} style={{ cursor: 'pointer' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.email}</div>
                <div style={{ marginTop: 4, minWidth: 0 }}>
                  <StatusPill variant={ROLE_PILL_VARIANT[u.role]} className="ele-pill--clip">
                    {roleLabel(u.role)}
                    {u.is_observer ? ' · Наблюдатель' : ''}
                    {u.can_maintain || u.can_manage_regulations ? ' · ТО' : ''}
                  </StatusPill>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                {u.employee_name ? (
                  <>
                    <Avatar user={u} />
                    {isMobile ? (
                      // Фамилия и имя — на разных строках; каждая обрезается
                      // многоточием по ширине колонки (не переносится).
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.employee_last_name}</span>
                        <span style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.employee_first_name}</span>
                      </span>
                    ) : (
                      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.employee_name}</span>
                    )}
                  </>
                ) : (
                  <span style={{ color: 'var(--color-text-placeholder)' }}>—</span>
                )}
              </div>
              {!isMobile ? (
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
              ) : null}
              <div style={{ textAlign: isMobile ? 'center' : 'right' }}>{statusButton(u)}</div>
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
