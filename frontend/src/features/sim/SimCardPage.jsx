import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Can, usePermissions } from '../../app/usePermissions.js'
import { EmployeePicker } from '../../shared/EmployeePicker.jsx'
import { nameInitials } from '../../shared/employeeName.js'
import { HistoryList } from '../../shared/HistoryList.jsx'
import { ActionMenu, BackButton, Button, Card, ConfirmModal, Modal, Spinner } from '../../shared/ui'
import {
  attachSimCard,
  deleteSimCard,
  detachSimCard,
  getSimCard,
  getSimHistoryPath,
} from '../employees/employeesApi.js'
import { SimCardModal } from '../employees/SimCardModal.jsx'

export function SimCardPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const perms = usePermissions()
  const [sim, setSim] = useState(null)
  const [loadError, setLoadError] = useState(false)
  const [editModal, setEditModal] = useState(false)
  const [showPicker, setShowPicker] = useState(false)
  const [confirmDetach, setConfirmDetach] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const load = useCallback(() => {
    setLoadError(false)
    getSimCard(id).then(setSim).catch(() => setLoadError(true))
  }, [id])
  useEffect(load, [load])

  if (loadError) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 60, textAlign: 'center' }}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>Не удалось открыть SIM-карту</div>
        <Link to="/sim-cards"><Button variant="secondary">К списку</Button></Link>
      </div>
    )
  }
  if (!sim) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spinner /></div>
  }

  const onAttach = async (employee) => {
    await attachSimCard(sim.id, employee.id)
    setShowPicker(false)
    load()
  }
  const onDetach = async () => {
    await detachSimCard(sim.id)
    load()
  }
  const onDelete = async () => {
    await deleteSimCard(sim.id)
    navigate('/sim-cards')
  }

  return (
    <div>
      <div className="ele-only-desktop" style={{ fontSize: 13, color: 'var(--color-text-placeholder)', marginBottom: 10 }}>
        <Link to="/sim-cards" style={{ color: 'var(--color-text-muted)' }}>Корпоративная связь</Link> / {sim.phone_number}
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flex: 1, minWidth: 0 }}>
          <BackButton />
          <h1 className="ele-card-title" style={{ fontFamily: 'var(--font-mono)' }}>{sim.phone_number}</h1>
        </div>
        {perms.canManageEmployees ? (
          <>
            <div className="ele-card-actions-desktop">
              <Button variant="secondary" onClick={() => setEditModal(true)}>Редактировать</Button>
              {sim.is_deactivated ? (
                <Button variant="danger" onClick={() => setConfirmDelete(true)}>Удалить</Button>
              ) : (
                <Button variant="danger" onClick={() => setConfirmDetach(true)}>Открепить</Button>
              )}
            </div>
            <div className="ele-card-actions-mobile">
              <ActionMenu
                items={[
                  { label: 'Редактировать', onClick: () => setEditModal(true) },
                  sim.is_deactivated
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
              <Field label="Номер телефона" value={sim.phone_number} mono />
              <Field label="Тип" value={sim.sim_type_display} />
              <Field label="Оператор" value={sim.network_operator} />
              <Field label="Поставщик услуг связи" value={sim.provider} />
              <Field label="Статус" value={sim.is_deactivated ? 'Деактивирована' : 'Активна'} />
            </div>
          </Card>

          <Card>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Закреплено за</div>
            {sim.employee ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ width: 46, height: 46, flex: 'none', borderRadius: '50%', background: 'var(--color-fill-active-tint)', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 600 }}>
                  {nameInitials(sim.employee_name)}
                </span>
                <Link to={`/employees/${sim.employee}`} style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  {sim.employee_name}
                </Link>
                <Can perm="canManageEmployees">
                  <Button variant="secondary" style={{ marginLeft: 'auto' }} onClick={() => setConfirmDetach(true)}>Открепить</Button>
                </Can>
              </div>
            ) : showPicker ? (
              <EmployeePicker autoFocus onSelect={onAttach} />
            ) : (
              <>
                <div style={{ fontSize: 15, color: 'var(--color-text-placeholder)' }}>Не закреплена</div>
                <Can perm="canManageEmployees">
                  <Button fullWidth style={{ marginTop: 14 }} onClick={() => setShowPicker(true)}>+ Привязать сотрудника</Button>
                </Can>
              </>
            )}
          </Card>
        </div>

        <Card className="ele-obj-layout__history">
          <HistoryList path={getSimHistoryPath(sim.id)} />
        </Card>
      </div>

      {editModal ? (
        <SimCardModal
          sim={sim}
          onClose={() => setEditModal(false)}
          onDone={() => {
            setEditModal(false)
            load()
          }}
        />
      ) : null}

      {confirmDetach ? (
        <ConfirmModal
          title="Открепить SIM-карту?"
          message={`SIM-карта ${sim.phone_number} будет откреплена от сотрудника ${sim.employee_name} и станет свободной.`}
          onConfirm={onDetach}
          onClose={() => setConfirmDetach(false)}
        />
      ) : null}

      {confirmDelete ? (
        <Modal open onClose={() => setConfirmDelete(false)} title="Удалить SIM-карту?">
          <div style={{ fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 1.5, margin: '4px 0 20px' }}>
            SIM-карта {sim.phone_number} будет удалена безвозвратно вместе с историей.
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
