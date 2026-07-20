import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Can, usePermissions } from '../../app/usePermissions.js'
import { nameInitials } from '../../shared/employeeName.js'
import { HistoryList } from '../../shared/HistoryList.jsx'
import { ActionMenu, BackButton, Button, Card, Icon, Spinner } from '../../shared/ui'
import { getPass, getPassHistoryPath } from '../employees/employeesApi.js'
import { KeyTarget } from '../../shared/keyTarget.jsx'
import { PassDisposeModal } from '../employees/PassDisposeModal.jsx'
import { PassAttachModal } from './PassAttachModal.jsx'

export function PassCardPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const perms = usePermissions()
  const [pass, setPass] = useState(null)
  const [loadError, setLoadError] = useState(false)
  const [showAttach, setShowAttach] = useState(false)
  const [disposeModal, setDisposeModal] = useState(false)
  const [historyKey, setHistoryKey] = useState(0)

  const load = useCallback(() => {
    setLoadError(false)
    getPass(id)
      .then((data) => {
        setPass(data)
        setHistoryKey((k) => k + 1)
      })
      .catch(() => setLoadError(true))
  }, [id])
  useEffect(load, [load])

  if (loadError) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 60, textAlign: 'center' }}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>Не удалось открыть средство доступа</div>
        <Link to="/passes"><Button variant="secondary">К списку</Button></Link>
      </div>
    )
  }
  if (!pass) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spinner /></div>
  }

  const isKey = pass.object_type === 'key'
  const title = isKey
    ? <>Ключ · <KeyTarget pass={pass} /></>
    : `Пропуск${pass.account_number && pass.account_number.trim() ? ` · № ${pass.account_number}` : ''}`
  const types = [pass.type_vehicle && 'Авто', pass.type_pedestrian && 'Пеший'].filter(Boolean).join(', ')
  const rooms = pass.rooms || []
  const places = pass.places || []
  const statusText = pass.is_utilized
    ? (pass.utilization_reason_display ? `Утилизирован (${pass.utilization_reason_display})` : 'Утилизирован')
    : pass.is_deactivated ? 'Не используется' : 'Активен'

  // Наборы действий: активный → открепить (с выбором утилизации); свободный →
  // редактировать/утилизировать; утилизированный → без действий (терминальный
  // статус, удаления из системы нет — только утилизация).
  const actions = []
  if (perms.canManageEmployees && !pass.is_utilized) {
    actions.push({ label: 'Редактировать', onClick: () => navigate(`/passes/${pass.id}/edit`) })
    if (pass.employee) {
      actions.push({ label: 'Открепить', danger: true, onClick: () => setDisposeModal(true) })
    } else {
      actions.push({ label: 'Утилизировать', danger: true, onClick: () => setDisposeModal(true) })
    }
  }

  return (
    <div>
      <div className="ele-only-desktop" style={{ fontSize: 13, color: 'var(--color-text-placeholder)', marginBottom: 10 }}>
        <Link to="/passes" style={{ color: 'var(--color-text-muted)' }}>Средства доступа</Link> / {title}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
          <BackButton />
          <h1 className="ele-card-title">{title}</h1>
        </div>
        {actions.length ? (
          <>
            <div className="ele-card-actions-desktop">
              {actions.map((a) => (
                <Button key={a.label} variant={a.danger ? 'danger' : 'secondary'} onClick={a.onClick}>{a.label}</Button>
              ))}
            </div>
            <div className="ele-card-actions-mobile">
              <ActionMenu items={actions} />
            </div>
          </>
        ) : null}
      </div>

      <div className={'ele-obj-layout' + (pass.is_utilized ? ' ele-obj-layout--no-side' : '')}>
        <div className="ele-obj-layout__main">
          <Card>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Основная информация</div>
            <div className="ele-field-grid">
              <Field label="Тип объекта" value={pass.object_type_display || (isKey ? 'Ключ' : 'Пропуск СКУД')} />
              <Field label="Учётный номер" value={pass.account_number} mono />
              {!isKey ? <Field label="Тип пропуска" value={types} /> : null}
              <Field label="Статус" value={statusText} />
            </div>
          </Card>

          <Card>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Доступ в</div>
            {(pass.buildings || []).length === 0 ? (
              <div style={{ fontSize: 13.5, color: 'var(--color-text-muted)' }}>Здания не указаны.</div>
            ) : isKey ? (
              <div style={{ fontSize: 13.5, fontWeight: 600 }}><KeyTarget pass={pass} /></div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {pass.buildings.map((b) => {
                  const parts = [
                    ...rooms.filter((r) => r.building === b.id).map((r) => r.name),
                    ...places.filter((p) => p.building === b.id).map((p) => (p.room_name ? `${p.room_name} / ${p.name}` : p.name)),
                  ]
                  const roomsText = parts.length === 0 ? 'все помещения' : parts.join(', ')
                  return (
                    <div key={b.id} style={{ fontSize: 13.5 }}>
                      <span style={{ fontWeight: 600 }}>{b.name}</span>
                      <span style={{ color: 'var(--color-text-placeholder)' }}> — {roomsText}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </Card>
        </div>

        {/* Боковой блок «Закреплено за». У утилизированного средства доступа
            (терминальный статус) всегда пуст — не показываем (одна колонка). */}
        {!pass.is_utilized ? (
        <Card className="ele-obj-layout__side ele-card-sticky">
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Закреплено за</div>
          {pass.employee ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ width: 46, height: 46, flex: 'none', borderRadius: '50%', background: 'var(--color-fill-active-tint)', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 600, overflow: 'hidden' }}>
                  {pass.employee_avatar ? (
                    <img src={pass.employee_avatar.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    nameInitials(pass.employee_name)
                  )}
                </span>
                <Link className="ele-clamp-2" to={`/employees/${pass.employee}`} style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)', minWidth: 0 }}>
                  {pass.employee_name}
                </Link>
              </div>
              <Can perm="canManageEmployees">
                <Button variant="secondary" fullWidth style={{ marginTop: 14 }} onClick={() => setDisposeModal(true)}>Открепить</Button>
              </Can>
            </>
          ) : (
            <>
              {pass.storage_place_detail ? (
                <div style={{ fontSize: 13.5, color: 'var(--color-text-muted)' }}>
                  На складе «{pass.storage_place_detail.name}» ({pass.storage_place_detail.building_name} — {pass.storage_place_detail.room_name})
                </div>
              ) : (
                <div style={{ fontSize: 15, color: 'var(--color-text-placeholder)' }}>Не закреплён</div>
              )}
              <Can perm="canManageEmployees">
                <Button fullWidth style={{ marginTop: 14 }} onClick={() => setShowAttach(true)}><Icon name="plus" size={18} strokeWidth={2.2} />Закрепить</Button>
              </Can>
            </>
          )}
        </Card>
        ) : null}

        <Card className="ele-obj-layout__history">
          <HistoryList path={getPassHistoryPath(pass.id)} reloadKey={historyKey} />
        </Card>
      </div>

      {disposeModal ? (
        <PassDisposeModal
          pass={pass}
          onClose={() => setDisposeModal(false)}
          onDone={() => {
            setDisposeModal(false)
            load()
          }}
        />
      ) : null}
      {showAttach ? (
        <PassAttachModal
          pass={pass}
          onClose={() => setShowAttach(false)}
          onDone={() => {
            setShowAttach(false)
            load()
          }}
        />
      ) : null}
    </div>
  )
}

function Field({ label, value, mono }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)', marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 500, fontFamily: mono ? 'var(--font-mono)' : 'inherit', overflowWrap: 'break-word' }}>{value || '—'}</div>
    </div>
  )
}
