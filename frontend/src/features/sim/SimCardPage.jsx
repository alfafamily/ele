import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Can, usePermissions } from '../../app/usePermissions.js'
import { AvatarCircle } from '../../shared/AvatarCircle.jsx'
import { LeadIconCircle } from '../../shared/LeadIconCircle.jsx'
import { PlacementRow } from '../../shared/PlacementRow.jsx'
import { HistoryList } from '../../shared/HistoryList.jsx'
import { ActionMenu, BackButton, Button, Card, Icon, Spinner } from '../../shared/ui'
import { getSimCard, getSimHistoryPath } from '../employees/employeesApi.js'
import { SimDisposeModal } from '../employees/SimDisposeModal.jsx'
import { SimDetachModal } from '../employees/SimDetachModal.jsx'
import { SimAttachModal } from './SimAttachModal.jsx'

export function SimCardPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const perms = usePermissions()
  const [sim, setSim] = useState(null)
  const [loadError, setLoadError] = useState(false)
  const [attachMode, setAttachMode] = useState(null) // 'employee' | 'equipment' | null → открывает модалку
  const [disposeModal, setDisposeModal] = useState(false)
  const [detachModal, setDetachModal] = useState(false)
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

  // Верхняя кнопка — только утилизация (как у прочих объектов имущества);
  // открепление вынесено отдельной операцией в блок «Размещение».
  // Утилизированная → без действий (терминальный статус, удаления из системы нет).
  const actions = []
  if (perms.canManageEmployees && !sim.is_utilized) {
    actions.push({ label: 'Редактировать', onClick: () => navigate(`/sim-cards/${sim.id}/edit`) })
    actions.push({ label: 'Утилизировать', danger: true, onClick: () => setDisposeModal(true) })
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
            </div>
          </Card>
        </div>

        {/* Боковой блок «Закреплено за». У утилизированной SIM (терминальный
            статус) всегда пуст — не показываем (одна колонка). */}
        {!sim.is_utilized ? (
        <Card className="ele-obj-layout__side ele-card-sticky">
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Размещение</div>
          {sim.employee ? (
            <>
              <PlacementRow
                circle={<AvatarCircle avatar={sim.employee_avatar} name={sim.employee_name} size={46} status={sim.acceptance_status} overlaySize={18} />}
                label="За сотрудником"
                title={<Link to={`/employees/${sim.employee}`} style={{ color: 'var(--color-text-primary)' }}>{sim.employee_name}</Link>}
                sub={sim.position || '—'}
              />
              <Can perm="canManageEmployees">
                <Button variant="secondary" fullWidth style={{ marginTop: 14 }} onClick={() => setDetachModal(true)}>Открепить</Button>
              </Can>
            </>
          ) : sim.equipment ? (
            <>
              <PlacementRow
                circle={<LeadIconCircle name="tag" size={46} iconSize={20} />}
                label="В оборудовании"
                title={<Link to={`/equipment/${sim.equipment}`} style={{ color: 'var(--color-text-primary)' }}>{sim.equipment_detail?.type_and_model || '—'}</Link>}
                sub={sim.equipment_detail?.inventory_number || undefined}
              />
              <Can perm="canManageEmployees">
                <Button variant="secondary" fullWidth style={{ marginTop: 14 }} onClick={() => setDetachModal(true)}>Открепить</Button>
              </Can>
            </>
          ) : (
            <>
              {sim.storage_place_detail ? (
                <PlacementRow
                  circle={<LeadIconCircle name="warehouse" size={46} iconSize={20} />}
                  label="На складе"
                  title={sim.storage_place_detail.name}
                  sub={`${sim.storage_place_detail.building_name} — ${sim.storage_place_detail.room_name}`}
                />
              ) : (
                <PlacementRow
                  circle={<LeadIconCircle name="warehouse" size={46} iconSize={20} />}
                  label="На складе"
                  title="Без склада"
                />
              )}
              <Can perm="canManageEmployees">
                <Button fullWidth style={{ marginTop: 14 }} onClick={() => setAttachMode('employee')}>
                  <Icon name="plus" size={18} strokeWidth={2.2} />
                  Закрепить
                </Button>
              </Can>
            </>
          )}
        </Card>
        ) : null}

        {perms.isStaff ? (
          <Card className="ele-obj-layout__history">
            <HistoryList path={getSimHistoryPath(sim.id)} reloadKey={historyKey} />
          </Card>
        ) : null}
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
      {detachModal ? (
        <SimDetachModal
          sim={sim}
          onClose={() => setDetachModal(false)}
          onDone={() => {
            setDetachModal(false)
            load()
          }}
        />
      ) : null}
      {attachMode ? (
        <SimAttachModal
          sim={sim}
          initialMode={attachMode}
          onClose={() => setAttachMode(null)}
          onDone={() => {
            setAttachMode(null)
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
