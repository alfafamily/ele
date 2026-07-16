import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Can, usePermissions } from '../../app/usePermissions.js'
import { EmployeePicker } from '../../shared/EmployeePicker.jsx'
import { nameInitials } from '../../shared/employeeName.js'
import { HistoryList } from '../../shared/HistoryList.jsx'
import { ActionMenu, BackButton, Button, Card, ConfirmModal, Modal, Spinner } from '../../shared/ui'
import {
  attachPass,
  deletePass,
  detachPass,
  getPass,
  getPassHistoryPath,
} from '../employees/employeesApi.js'
import { PassModal } from '../employees/PassModal.jsx'

export function PassCardPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const perms = usePermissions()
  const [pass, setPass] = useState(null)
  const [loadError, setLoadError] = useState(false)
  const [editModal, setEditModal] = useState(false)
  const [showPicker, setShowPicker] = useState(false)
  const [confirmDetach, setConfirmDetach] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const load = useCallback(() => {
    setLoadError(false)
    getPass(id).then(setPass).catch(() => setLoadError(true))
  }, [id])
  useEffect(load, [load])

  if (loadError) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 60, textAlign: 'center' }}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>Не удалось открыть пропуск</div>
        <Link to="/passes"><Button variant="secondary">К списку</Button></Link>
      </div>
    )
  }
  if (!pass) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spinner /></div>
  }

  const title = pass.name || (pass.account_number && pass.account_number.trim() ? `№ ${pass.account_number}` : 'Пропуск')
  const types = [pass.type_vehicle && 'Авто', pass.type_pedestrian && 'Пеший'].filter(Boolean).join(', ')
  const rooms = pass.rooms || []

  const onAttach = async (employee) => {
    await attachPass(pass.id, employee.id)
    setShowPicker(false)
    load()
  }
  const onDetach = async () => {
    await detachPass(pass.id)
    load()
  }
  const onDelete = async () => {
    await deletePass(pass.id)
    navigate('/passes')
  }

  return (
    <div>
      <div className="ele-only-desktop" style={{ fontSize: 13, color: 'var(--color-text-placeholder)', marginBottom: 10 }}>
        <Link to="/passes" style={{ color: 'var(--color-text-muted)' }}>Пропуска</Link> / {title}
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flex: 1, minWidth: 0 }}>
          <BackButton />
          <h1 className="ele-card-title">{title}</h1>
        </div>
        {perms.canManageEmployees ? (
          <>
            <div className="ele-card-actions-desktop">
              <Button variant="secondary" onClick={() => setEditModal(true)}>Редактировать</Button>
              {pass.is_deactivated ? (
                <Button variant="danger" onClick={() => setConfirmDelete(true)}>Удалить</Button>
              ) : (
                <Button variant="danger" onClick={() => setConfirmDetach(true)}>Открепить</Button>
              )}
            </div>
            <div className="ele-card-actions-mobile">
              <ActionMenu
                items={[
                  { label: 'Редактировать', onClick: () => setEditModal(true) },
                  pass.is_deactivated
                    ? { label: 'Удалить', danger: true, onClick: () => setConfirmDelete(true) }
                    : { label: 'Открепить', danger: true, onClick: () => setConfirmDetach(true) },
                ]}
              />
            </div>
          </>
        ) : null}
      </div>

      <div className="ele-obj-layout ele-obj-layout--no-side">
        <div className="ele-obj-layout__main">
          <Card>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Основная информация</div>
            <div className="ele-field-grid">
              <Field label="Название" value={pass.name} />
              <Field label="Учётный номер" value={pass.account_number} mono />
              <Field label="Тип пропуска" value={types} />
              <Field label="Статус" value={pass.is_deactivated ? 'Деактивирован' : 'Активен'} />
            </div>
          </Card>

          <Card>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Доступ в</div>
            {(pass.buildings || []).length === 0 ? (
              <div style={{ fontSize: 13.5, color: 'var(--color-text-muted)' }}>Здания не указаны.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {pass.buildings.map((b) => {
                  const bRooms = rooms.filter((r) => r.building === b.id)
                  const roomsText = bRooms.length === 0 ? 'все помещения' : bRooms.map((r) => r.name).join(', ')
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

          <Card>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Закреплено за</div>
            {pass.employee ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ width: 46, height: 46, flex: 'none', borderRadius: '50%', background: 'var(--color-fill-active-tint)', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 600 }}>
                  {nameInitials(pass.employee_name)}
                </span>
                <Link to={`/employees/${pass.employee}`} style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  {pass.employee_name}
                </Link>
                <Can perm="canManageEmployees">
                  <Button variant="secondary" style={{ marginLeft: 'auto' }} onClick={() => setConfirmDetach(true)}>Открепить</Button>
                </Can>
              </div>
            ) : showPicker ? (
              <EmployeePicker autoFocus onSelect={onAttach} />
            ) : (
              <>
                <div style={{ fontSize: 15, color: 'var(--color-text-placeholder)' }}>Не закреплён</div>
                <Can perm="canManageEmployees">
                  <Button fullWidth style={{ marginTop: 14 }} onClick={() => setShowPicker(true)}>+ Привязать сотрудника</Button>
                </Can>
              </>
            )}
          </Card>
        </div>

        <Card className="ele-obj-layout__history">
          <HistoryList path={getPassHistoryPath(pass.id)} />
        </Card>
      </div>

      {editModal ? (
        <PassModal
          pass={pass}
          onClose={() => setEditModal(false)}
          onDone={() => {
            setEditModal(false)
            load()
          }}
        />
      ) : null}

      {confirmDetach ? (
        <ConfirmModal
          title="Открепить пропуск?"
          message={`Пропуск «${title}» будет откреплён от сотрудника ${pass.employee_name} и станет свободным.`}
          onConfirm={onDetach}
          onClose={() => setConfirmDetach(false)}
        />
      ) : null}

      {confirmDelete ? (
        <Modal open onClose={() => setConfirmDelete(false)} title="Удалить пропуск?">
          <div style={{ fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 1.5, margin: '4px 0 20px' }}>
            Пропуск {title} будет удалён безвозвратно вместе с историей.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Button variant="danger" fullWidth onClick={onDelete}>Удалить</Button>
            <Button variant="secondary" fullWidth onClick={() => setConfirmDelete(false)}>Отмена</Button>
          </div>
        </Modal>
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
