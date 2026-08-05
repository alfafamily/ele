import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRefreshDuplicates } from '../../app/CompanyContext.jsx'
import { Badge, Banner, Button, Card, EmptyState, Icon, Modal, ModalActions, Select, Spinner } from '../../shared/ui'
import {
  dismissEmployeeDuplicate,
  getEmployeeDuplicates,
  resolveEmployeeDuplicate,
  undismissEmployeeDuplicate,
} from './settingsApi.js'

const cardStyle = { display: 'flex', flexDirection: 'column', gap: 12 }
const memberBox = {
  border: '1px solid var(--color-border)',
  borderRadius: 10,
  padding: '10px 12px',
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
}

function metaLine(member) {
  const parts = [member.position, member.department].filter(Boolean)
  return parts.join(' · ')
}

// Кого система оставит в принципе 3 (больше всего ссылок; тай-брейк — меньший
// id) — для показа в модалке. Логика зеркалит бэкенд.
function pickMostRefs(members) {
  return [...members].sort((a, b) => b.reference_count - a.reference_count || a.id - b.id)[0]
}

function MemberRow({ member, tag }) {
  return (
    <div style={memberBox}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 600 }}>{member.full_name}</span>
        {member.has_user ? (
          <Badge style={{ color: 'var(--color-success)', background: 'var(--color-success-bg, #E9F7EF)' }}>
            Учётная запись: {member.user_email}
          </Badge>
        ) : (
          <Badge>Без учётной записи</Badge>
        )}
        {tag ? <Badge style={{ color: 'var(--color-warning)', background: 'var(--color-warning-bg)' }}>{tag}</Badge> : null}
      </div>
      <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)' }}>
        {metaLine(member) ? metaLine(member) + ' · ' : ''}Закреплено объектов: {member.reference_count}
      </div>
    </div>
  )
}

// Модалка «Устранить дублирование». Поведение зависит от состава группы:
//  • auto_linked (принцип 1) — всё в единственного связанного, подтверждение;
//  • auto_most_refs (принцип 3) — всё в запись с макс. числом ссылок, подтверждение;
//  • map_to_linked (принцип 2) — выбрать, к какому связанному присоединить каждого
//    несвязанного.
function ResolveModal({ group, onClose, onResolved }) {
  const linked = useMemo(() => group.members.filter((m) => m.has_user), [group])
  const unlinked = useMemo(() => group.members.filter((m) => !m.has_user), [group])
  const [mapping, setMapping] = useState(() =>
    Object.fromEntries(unlinked.map((m) => [m.id, linked[0]?.id])),
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const kind = group.resolution_kind
  const survivor = kind === 'auto_linked' ? linked[0] : kind === 'auto_most_refs' ? pickMostRefs(unlinked) : null

  const submit = async () => {
    setLoading(true)
    setError(null)
    try {
      const payload = kind === 'map_to_linked' ? mapping : undefined
      await resolveEmployeeDuplicate(group.signature, payload)
      onResolved()
    } catch (err) {
      setError(err.detail || 'Не удалось устранить дублирование.')
      setLoading(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Устранить дублирование">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {survivor ? (
          <div style={{ fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
            Останется запись:{' '}
            <strong>{survivor.full_name}</strong>
            {survivor.has_user ? ` (${survivor.user_email})` : ''}. Остальные записи будут присоединены к
            ней и удалены.
          </div>
        ) : (
          <div style={{ fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
            В группе несколько сотрудников с учётными записями. Выберите, к какому из них присоединить
            каждого сотрудника без учётной записи.
          </div>
        )}

        {kind === 'map_to_linked' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {unlinked.map((m) => (
              <div key={m.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>
                  {m.full_name} · закреплено объектов: {m.reference_count}
                </div>
                <Select
                  value={mapping[m.id] ?? ''}
                  onChange={(v) => setMapping((prev) => ({ ...prev, [m.id]: Number(v) }))}
                  label="Присоединить к"
                >
                  {linked.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.full_name} ({t.user_email})
                    </option>
                  ))}
                </Select>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {group.members.map((m) => (
              <MemberRow
                key={m.id}
                member={m}
                tag={survivor && m.id === survivor.id ? 'Останется' : 'Будет удалён'}
              />
            ))}
          </div>
        )}

        <Banner variant="warning">
          Операция необратима: закреплённые объекты будут перенесены, а поглощённые записи удалены.
        </Banner>

        {error ? <Banner variant="error">{error}</Banner> : null}

        <ModalActions>
          <Button variant="danger" fullWidth loading={loading} onClick={submit}>
            Объединить
          </Button>
          <Button variant="secondary" fullWidth onClick={onClose} disabled={loading}>
            Отмена
          </Button>
        </ModalActions>
      </div>
    </Modal>
  )
}

function GroupCard({ group, onResolve, onDismiss, onUndismiss, busy }) {
  const title = group.members[0] ? `${group.members[0].last_name} ${group.members[0].first_name}` : 'Сотрудник'
  return (
    <Card style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Icon name="triangle-alert" size={18} strokeWidth={2} style={{ color: 'var(--color-warning)', flex: 'none' }} />
        <span style={{ fontWeight: 600, fontSize: 15 }}>{title}</span>
        <span style={{ fontSize: 12, color: 'var(--color-text-placeholder)' }}>
          — {group.members.length} записи
        </span>
        {group.dismissed ? (
          <Badge style={{ marginLeft: 'auto' }}>Не дубль</Badge>
        ) : null}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {group.members.map((m) => (
          <MemberRow key={m.id} member={m} />
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {group.dismissed ? (
          <Button variant="secondary" onClick={() => onUndismiss(group)} disabled={busy}>
            Вернуть в дубли
          </Button>
        ) : (
          <>
            <Button variant="primary" onClick={() => onResolve(group)} disabled={busy}>
              Устранить дублирование
            </Button>
            <Button variant="secondary" onClick={() => onDismiss(group)} disabled={busy}>
              Дублем не является
            </Button>
          </>
        )}
      </div>
    </Card>
  )
}

export function EmployeeDuplicatesTab() {
  const refreshDuplicates = useRefreshDuplicates()
  const [groups, setGroups] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [resolving, setResolving] = useState(null) // группа для модалки

  const load = useCallback(() => {
    setError(null)
    return getEmployeeDuplicates()
      .then((data) => setGroups(data.groups))
      .catch((err) => setError(err.detail || 'Не удалось загрузить список.'))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const afterMutation = useCallback(async () => {
    await load()
    refreshDuplicates?.()
  }, [load, refreshDuplicates])

  const runAction = async (fn) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      await afterMutation()
    } catch (err) {
      setError(err.detail || 'Действие не выполнено.')
    } finally {
      setBusy(false)
    }
  }

  const onDismiss = (group) => runAction(() => dismissEmployeeDuplicate(group.signature))
  const onUndismiss = (group) => runAction(() => undismissEmployeeDuplicate(group.signature))

  if (groups === null && !error) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
        <Spinner />
      </div>
    )
  }

  const active = (groups || []).filter((g) => !g.dismissed)
  const dismissed = (groups || []).filter((g) => g.dismissed)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 720 }}>
      {error ? <Banner variant="error">{error}</Banner> : null}

      {active.length === 0 && dismissed.length === 0 ? (
        <EmptyState title="Дублей не обнаружено" description="Возможные дубли сотрудников не обнаружены." />
      ) : null}

      {active.map((g) => (
        <GroupCard
          key={g.signature}
          group={g}
          busy={busy}
          onResolve={setResolving}
          onDismiss={onDismiss}
          onUndismiss={onUndismiss}
        />
      ))}

      {dismissed.length > 0 ? (
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-placeholder)', marginTop: 4 }}>
          Отмечены как «не дубль»
        </div>
      ) : null}
      {dismissed.map((g) => (
        <GroupCard
          key={g.signature}
          group={g}
          busy={busy}
          onResolve={setResolving}
          onDismiss={onDismiss}
          onUndismiss={onUndismiss}
        />
      ))}

      {resolving ? (
        <ResolveModal
          group={resolving}
          onClose={() => setResolving(null)}
          onResolved={async () => {
            setResolving(null)
            await afterMutation()
          }}
        />
      ) : null}
    </div>
  )
}
