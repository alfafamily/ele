import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Can, usePermissions } from '../../app/usePermissions.js'
import { EmployeePicker } from '../../shared/EmployeePicker.jsx'
import { EquipmentPicker } from '../../shared/EquipmentPicker.jsx'
import { nameInitials } from '../../shared/employeeName.js'
import { HistoryList } from '../../shared/HistoryList.jsx'
import { ActionMenu, BackButton, Button, Card, Icon, Spinner } from '../../shared/ui'
import {
  attachSimCard,
  attachSimToEquipment,
  getSimCard,
  getSimHistoryPath,
} from '../employees/employeesApi.js'
import { SimDisposeModal } from '../employees/SimDisposeModal.jsx'

export function SimCardPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const perms = usePermissions()
  const [sim, setSim] = useState(null)
  const [loadError, setLoadError] = useState(false)
  const [showPicker, setShowPicker] = useState(null) // 'employee' | 'equipment' | null
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

  const onAttachEmployee = async (employee) => {
    await attachSimCard(sim.id, employee.id)
    setShowPicker(null)
    load()
  }
  const onAttachEquipment = async (equipment) => {
    await attachSimToEquipment(sim.id, equipment.id)
    setShowPicker(null)
    load()
  }
  const isPlaced = Boolean(sim.employee || sim.equipment)

  // Размещённая → открепить/утилизировать; свободная → редактировать/утилизировать;
  // утилизированная → без действий (терминальный статус, удаления из системы нет).
  const actions = []
  if (perms.canManageEmployees && !sim.is_utilized) {
    actions.push({ label: 'Редактировать', onClick: () => navigate(`/sim-cards/${sim.id}/edit`) })
    if (isPlaced) {
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

      <div className={'ele-obj-layout' + (sim.is_utilized ? ' ele-obj-layout--no-side' : '')}>
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
        </div>

        {/* Боковой блок «Закреплено за». У утилизированной SIM (терминальный
            статус) всегда пуст — не показываем (одна колонка). */}
        {!sim.is_utilized ? (
        <Card className="ele-obj-layout__side ele-card-sticky">
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Размещение</div>
          {sim.employee ? (
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
          ) : sim.equipment ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ width: 46, height: 46, flex: 'none', borderRadius: '50%', background: 'var(--color-fill-active-tint)', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="wrench" size={20} strokeWidth={2} />
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)' }}>В оборудовании</div>
                <Link to={`/equipment/${sim.equipment}`} style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  {sim.equipment_name}
                </Link>
              </div>
              <Can perm="canManageEmployees">
                <Button variant="secondary" style={{ marginLeft: 'auto' }} onClick={() => setDisposeModal(true)}>Открепить</Button>
              </Can>
            </div>
          ) : showPicker === 'employee' ? (
            <EmployeePicker autoFocus onSelect={onAttachEmployee} />
          ) : showPicker === 'equipment' ? (
            <EquipmentPicker autoFocus onSelect={onAttachEquipment} />
          ) : (
            <>
              {sim.storage_place_detail ? (
                <div style={{ fontSize: 13.5, color: 'var(--color-text-muted)', marginBottom: 12 }}>
                  На складе «{sim.storage_place_detail.name}» ({sim.storage_place_detail.building_name} — {sim.storage_place_detail.room_name})
                </div>
              ) : (
                <div style={{ fontSize: 15, color: 'var(--color-text-placeholder)' }}>Не закреплена</div>
              )}
              <Can perm="canManageEmployees">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
                  <Button fullWidth onClick={() => setShowPicker('employee')}><Icon name="plus" size={18} strokeWidth={2.2} />Привязать сотрудника</Button>
                  <Button variant="secondary" fullWidth onClick={() => setShowPicker('equipment')}><Icon name="wrench" size={17} strokeWidth={2} />Установить в оборудование</Button>
                </div>
              </Can>
            </>
          )}
        </Card>
        ) : null}

        <Card className="ele-obj-layout__history">
          <HistoryList path={getSimHistoryPath(sim.id)} reloadKey={historyKey} />
        </Card>
      </div>

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
