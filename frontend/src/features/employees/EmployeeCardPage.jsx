import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { apiPatch } from '../../shared/api/client'
import { Can, usePermissions } from '../../app/usePermissions.js'
import { ActionMenu, BackButton, Button, Card, Icon, Spinner, StatusPill } from '../../shared/ui'
import { nameInitials } from '../../shared/employeeName.js'
import { detachPass, detachSimCard, getEmployee, restoreEmployee, uploadEmployeeAvatar } from './employeesApi.js'
import { AttachOrCreateModal } from './AttachOrCreateModal.jsx'
import { PassInfo } from './PassInfo.jsx'
import { PassModal } from './PassModal.jsx'
import { SimCardInfo } from './SimCardInfo.jsx'
import { SimCardModal } from './SimCardModal.jsx'
import { TerminateModal } from './TerminateModal.jsx'

export function EmployeeCardPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const perms = usePermissions()
  const [employee, setEmployee] = useState(null)
  const [showTerminate, setShowTerminate] = useState(false)
  // null — закрыто; 'new' — создание новой (сразу привязанной); объект SIM —
  // редактирование. simAttach — модалка выбора свободной для привязки.
  const [simModal, setSimModal] = useState(null)
  const [simAttach, setSimAttach] = useState(false)
  // Аналогично для пропусков.
  const [passModal, setPassModal] = useState(null)
  const [passAttach, setPassAttach] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const fileInputRef = useRef(null)

  const load = useCallback(() => {
    getEmployee(id).then(setEmployee)
  }, [id])

  useEffect(load, [load])

  if (!employee) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
        <Spinner />
      </div>
    )
  }

  const onAvatarSelected = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingAvatar(true)
    try {
      await uploadEmployeeAvatar(employee.id, file)
      load()
    } finally {
      setUploadingAvatar(false)
      e.target.value = ''
    }
  }

  const onDetachEquipment = async (equipmentId) => {
    await apiPatch(`/api/equipment/${equipmentId}/`, { employee: null })
    load()
  }

  const onDetachSim = async (simId) => {
    await detachSimCard(simId)
    load()
  }

  const onDetachPass = async (passId) => {
    await detachPass(passId)
    load()
  }

  const onRestore = async () => {
    await restoreEmployee(employee.id)
    load()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ width: '100%', maxWidth: 660, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1, minWidth: 0 }}>
            <BackButton />
            <span
              style={{
                width: 54,
                height: 54,
                flex: 'none',
                borderRadius: '50%',
                background: 'var(--color-fill-active-tint)',
                color: 'var(--color-text-muted)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 18,
                fontWeight: 600,
                overflow: 'hidden',
                position: 'relative',
                cursor: perms.canManageEmployees ? 'pointer' : 'default',
              }}
              onClick={() => perms.canManageEmployees && fileInputRef.current?.click()}
              title={perms.canManageEmployees ? 'Изменить фото' : undefined}
            >
              {employee.avatar ? <img src={employee.avatar.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : nameInitials(employee.full_name)}
              {uploadingAvatar ? <Spinner size={20} /> : null}
            </span>
            {perms.canManageEmployees ? (
              <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onAvatarSelected} />
            ) : null}
            <div style={{ minWidth: 0 }}>
              {/* Должность/отдел в заголовке не дублируем — они в «Данных сотрудника» */}
              <div className="ele-clamp-2" style={{ fontSize: 20, fontWeight: 600 }}>{employee.full_name}</div>
            </div>
          </div>
          {employee.is_employed ? (
            <Can perm="canManageEmployees">
              <div className="ele-card-actions-desktop">
                <Link to={`/employees/${employee.id}/edit`}>
                  <Button variant="secondary">Редактировать</Button>
                </Link>
                <Button variant="danger" onClick={() => setShowTerminate(true)}>
                  Уволить
                </Button>
              </div>
              <div className="ele-card-actions-mobile">
                <ActionMenu
                  items={[
                    { label: 'Редактировать', onClick: () => navigate(`/employees/${employee.id}/edit`) },
                    { label: 'Уволить', danger: true, onClick: () => setShowTerminate(true) },
                  ]}
                />
              </div>
            </Can>
          ) : (
            <Can perm="canManageEmployees">
              <Button variant="secondary" onClick={onRestore}>Восстановить</Button>
            </Can>
          )}
        </div>

        <Card>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Данные сотрудника</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 28px' }}>
            <Field label="Должность" value={employee.position} />
            <Field label="Отдел" value={employee.department} />
            <div>
              <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)', marginBottom: 4 }}>Статус</div>
              <StatusPill variant={employee.is_employed ? 'assigned' : 'archived'}>{employee.is_employed ? 'Работает' : 'Уволен'}</StatusPill>
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)', marginBottom: 4 }}>Учётная запись</div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{employee.user_email || <span style={{ color: 'var(--color-text-placeholder)' }}>Не связана</span>}</div>
            </div>
          </div>
        </Card>

        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontSize: 16, fontWeight: 600 }}>Закреплённое оборудование</div>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', background: 'var(--color-fill-active-tint)', padding: '2px 9px', borderRadius: 20 }}>
              {employee.equipment.length}
            </span>
          </div>
          {employee.equipment.length === 0 ? (
            <div style={{ fontSize: 13.5, color: 'var(--color-text-muted)' }}>За сотрудником не закреплено оборудование.</div>
          ) : (
            employee.equipment.map((eq) => (
              <div key={eq.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 13px', background: 'var(--color-fill-input)', borderRadius: 10, marginBottom: 8 }}>
                <Link to={`/equipment/${eq.id}`} style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--color-text-primary)' }}>{eq.type_and_model}</div>
                  <div style={{ font: '500 12px var(--font-mono)', color: 'var(--color-text-placeholder)' }}>{eq.inventory_number}</div>
                </Link>
                <Can perm="canManageEquipment">
                  <Button variant="secondary" onClick={() => onDetachEquipment(eq.id)}>
                    Открепить
                  </Button>
                </Can>
                <Link to={`/equipment/${eq.id}`} style={{ width: 28, height: 28, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="chevron-right" size={16} strokeWidth={2} style={{ color: '#C7C9D4' }} />
                </Link>
              </div>
            ))
          )}
        </Card>

        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ fontSize: 16, fontWeight: 600 }}>Корпоративная связь</div>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', background: 'var(--color-fill-active-tint)', padding: '2px 9px', borderRadius: 20 }}>
              {employee.sim_cards.length}
            </span>
          </div>
          {employee.sim_cards.length === 0 ? (
            <div style={{ fontSize: 13.5, color: 'var(--color-text-muted)' }}>За сотрудником не закреплено SIM-карт.</div>
          ) : (
            employee.sim_cards.map((sim) => (
              <div key={sim.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 13px', background: 'var(--color-fill-input)', borderRadius: 10, marginBottom: 8 }}>
                <SimCardInfo sim={sim} />
                {employee.is_employed ? (
                  <Can perm="canManageEmployees">
                    <div className="ele-card-actions-desktop">
                      <Button variant="secondary" onClick={() => setSimModal(sim)}>
                        Изменить
                      </Button>
                      <Button variant="secondary" onClick={() => onDetachSim(sim.id)}>
                        Открепить
                      </Button>
                    </div>
                    <div className="ele-card-actions-mobile">
                      <ActionMenu
                        items={[
                          { label: 'Изменить', onClick: () => setSimModal(sim) },
                          { label: 'Открепить', onClick: () => onDetachSim(sim.id) },
                        ]}
                      />
                    </div>
                  </Can>
                ) : null}
              </div>
            ))
          )}
          {employee.is_employed ? (
            <Can perm="canManageEmployees">
              <Button variant="secondary" fullWidth style={{ marginTop: employee.sim_cards.length ? 4 : 12 }} onClick={() => setSimAttach(true)}>
                + Добавить SIM-карту
              </Button>
            </Can>
          ) : null}
        </Card>

        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ fontSize: 16, fontWeight: 600 }}>Пропуска</div>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', background: 'var(--color-fill-active-tint)', padding: '2px 9px', borderRadius: 20 }}>
              {employee.passes.length}
            </span>
          </div>
          {employee.passes.length === 0 ? (
            <div style={{ fontSize: 13.5, color: 'var(--color-text-muted)' }}>За сотрудником не закреплено пропусков.</div>
          ) : (
            employee.passes.map((pass) => (
              <div key={pass.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 13px', background: 'var(--color-fill-input)', borderRadius: 10, marginBottom: 8 }}>
                <PassInfo pass={pass} />
                {employee.is_employed ? (
                  <Can perm="canManageEmployees">
                    <div className="ele-card-actions-desktop">
                      <Button variant="secondary" onClick={() => setPassModal(pass)}>
                        Изменить
                      </Button>
                      <Button variant="secondary" onClick={() => onDetachPass(pass.id)}>
                        Открепить
                      </Button>
                    </div>
                    <div className="ele-card-actions-mobile">
                      <ActionMenu
                        items={[
                          { label: 'Изменить', onClick: () => setPassModal(pass) },
                          { label: 'Открепить', onClick: () => onDetachPass(pass.id) },
                        ]}
                      />
                    </div>
                  </Can>
                ) : null}
              </div>
            ))
          )}
          {employee.is_employed ? (
            <Can perm="canManageEmployees">
              <Button variant="secondary" fullWidth style={{ marginTop: employee.passes.length ? 4 : 12 }} onClick={() => setPassAttach(true)}>
                + Добавить пропуск
              </Button>
            </Can>
          ) : null}
        </Card>
      </div>

      {simAttach ? (
        <AttachOrCreateModal
          kind="sim"
          employeeId={employee.id}
          onClose={() => setSimAttach(false)}
          onAttached={() => {
            setSimAttach(false)
            load()
          }}
          onCreateNew={() => {
            setSimAttach(false)
            setSimModal('new')
          }}
        />
      ) : null}

      {simModal ? (
        <SimCardModal
          employeeId={employee.id}
          sim={simModal === 'new' ? null : simModal}
          onClose={() => setSimModal(null)}
          onDone={() => {
            setSimModal(null)
            load()
          }}
        />
      ) : null}

      {passAttach ? (
        <AttachOrCreateModal
          kind="pass"
          employeeId={employee.id}
          onClose={() => setPassAttach(false)}
          onAttached={() => {
            setPassAttach(false)
            load()
          }}
          onCreateNew={() => {
            setPassAttach(false)
            setPassModal('new')
          }}
        />
      ) : null}

      {passModal ? (
        <PassModal
          employeeId={employee.id}
          pass={passModal === 'new' ? null : passModal}
          onClose={() => setPassModal(null)}
          onDone={() => {
            setPassModal(null)
            load()
          }}
        />
      ) : null}

      {showTerminate ? (
        <TerminateModal
          employee={employee}
          onClose={() => setShowTerminate(false)}
          onDone={() => {
            setShowTerminate(false)
            load()
          }}
        />
      ) : null}
    </div>
  )
}

function Field({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 500 }}>{value || '—'}</div>
    </div>
  )
}
