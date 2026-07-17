import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Can, usePermissions } from '../../app/usePermissions.js'
import { EmployeePicker } from '../../shared/EmployeePicker.jsx'
import { nameInitials } from '../../shared/employeeName.js'
import { HistoryList } from '../../shared/HistoryList.jsx'
import { ActionMenu, BackButton, Button, Card, Spinner } from '../../shared/ui'
import {
  attachSimCard,
  getSimCard,
  getSimHistoryPath,
} from '../employees/employeesApi.js'
import { SimCardModal } from '../employees/SimCardModal.jsx'
import { SimDisposeModal } from '../employees/SimDisposeModal.jsx'

export function SimCardPage() {
  const { id } = useParams()
  const perms = usePermissions()
  const [sim, setSim] = useState(null)
  const [loadError, setLoadError] = useState(false)
  const [editModal, setEditModal] = useState(false)
  const [showPicker, setShowPicker] = useState(false)
  const [disposeModal, setDisposeModal] = useState(false)
  const [historyKey, setHistoryKey] = useState(0)

  const load = useCallback(() => {
    setLoadError(false)
    getSimCard(id)
      .then((data) => {
        setSim(data)
        setHistoryKey((k) => k + 1)
      })
      .catch(() => setLoadError(true))
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

  const statusText = sim.is_utilized ? 'Утилизирована' : sim.is_deactivated ? 'Не используется' : 'Активна'

  const onAttach = async (employee) => {
    await attachSimCard(sim.id, employee.id)
    setShowPicker(false)
    load()
  }

  // Активная → открепить/утилизировать; свободная → редактировать/утилизировать;
  // утилизированная → без действий (терминальный статус, удаления из системы нет).
  const actions = []
  if (perms.canManageEmployees && !sim.is_utilized) {
    actions.push({ label: 'Редактировать', onClick: () => setEditModal(true) })
    if (sim.employee) {
      actions.push({ label: 'Открепить', danger: true, onClick: () => setDisposeModal(true) })
    } else {
      actions.push({ label: 'Утилизировать', danger: true, onClick: () => setDisposeModal(true) })
    }
  }

  return (
    <div>
      <div className="ele-only-desktop" style={{ fontSize: 13, color: 'var(--color-text-placeholder)', marginBottom: 10 }}>
        <Link to="/sim-cards" style={{ color: 'var(--color-text-muted)' }}>Корпоративная связь</Link> / {sim.phone_number}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
          <BackButton />
          <h1 className="ele-card-title" style={{ fontFamily: 'var(--font-mono)' }}>{sim.phone_number}</h1>
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

      <div className="ele-obj-layout ele-obj-layout--no-side">
        <div className="ele-obj-layout__main">
          <Card>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Основная информация</div>
            <div className="ele-field-grid">
              <Field label="Номер телефона" value={sim.phone_number} mono />
              <Field label="Тип" value={sim.sim_type_display} />
              <Field label="Оператор" value={sim.network_operator} />
              <Field label="Поставщик услуг связи" value={sim.provider} />
              <Field label="Статус" value={statusText} />
            </div>
          </Card>

          <Card>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Закреплено за</div>
            {sim.is_utilized ? (
              <div style={{ fontSize: 15, color: 'var(--color-text-placeholder)' }}>{statusText}</div>
            ) : sim.employee ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ width: 46, height: 46, flex: 'none', borderRadius: '50%', background: 'var(--color-fill-active-tint)', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 600 }}>
                  {nameInitials(sim.employee_name)}
                </span>
                <Link to={`/employees/${sim.employee}`} style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  {sim.employee_name}
                </Link>
                <Can perm="canManageEmployees">
                  <Button variant="secondary" style={{ marginLeft: 'auto' }} onClick={() => setDisposeModal(true)}>Открепить</Button>
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
          <HistoryList path={getSimHistoryPath(sim.id)} reloadKey={historyKey} />
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

      {disposeModal ? (
        <SimDisposeModal
          sim={sim}
          onClose={() => setDisposeModal(false)}
          onDone={() => {
            setDisposeModal(false)
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
