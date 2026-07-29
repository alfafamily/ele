import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../app/AuthContext.jsx'
import { roleLabel } from '../../shared/roles.js'
import { nameInitials } from '../../shared/employeeName.js'
import { PlanLink } from '../../shared/PlanLink.jsx'
import { TransportParkingLine } from '../../shared/TransportParkingLine.jsx'
import { Button, Card, ConfirmModal, Icon, Spinner } from '../../shared/ui'
import { LeadIconCircle } from '../../shared/LeadIconCircle.jsx'
import { RejectAssignmentModal } from './RejectAssignmentModal.jsx'
import { deleteEmployeeAvatar, uploadEmployeeAvatar } from '../employees/employeesApi.js'
import { PassInfo } from '../employees/PassInfo.jsx'
import { SimCardInfo } from '../employees/SimCardInfo.jsx'
import { ChangeEmailModal } from './ChangeEmailModal.jsx'
import { ChangePasswordModal } from './ChangePasswordModal.jsx'
import { acceptAssignment, getMyEquipment, getMyPasses, getMyPendingAssignments, getMySimCards, getMyTransport, getMyWorkPlacement, rejectAssignment } from './profileApi.js'

const KIND_ICON = { equipment: 'tag', sim: 'radio-tower', pass: 'key-square', tool: 'hammer', transport: 'car' }

const avatarMenuItem = {
  border: 'none',
  background: 'none',
  textAlign: 'left',
  padding: '10px 12px',
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
  color: 'var(--color-text-primary)',
  whiteSpace: 'nowrap',
}

// B44. Компактные кнопки в шапке профиля (укладываются в высоту аватара).
const headerBtnBase = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '7px 14px',
  borderRadius: 8,
  fontSize: 13.5,
  fontWeight: 600,
  fontFamily: 'inherit',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  lineHeight: 1,
}
const notifBtnStyle = {
  ...headerBtnBase,
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  color: 'var(--color-text-primary)',
}
// «Выход»: белая заливка, красная обводка и красный текст.
const logoutBtnStyle = {
  ...headerBtnBase,
  background: '#fff',
  border: '1px solid var(--color-error)',
  color: 'var(--color-error)',
}

export function ProfilePage() {
  const { user, logout, refreshUser } = useAuth()
  const navigate = useNavigate()
  const [showChangePassword, setShowChangePassword] = useState(false)
  const [showChangeEmail, setShowChangeEmail] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [avatarMenu, setAvatarMenu] = useState(false)
  const [simCards, setSimCards] = useState([])
  const [passes, setPasses] = useState([])
  const [equipment, setEquipment] = useState([])
  const [transport, setTransport] = useState([])
  const [tools, setTools] = useState([])
  const [workplaces, setWorkplaces] = useState([])
  const [parkingSpots, setParkingSpots] = useState([])
  const [pending, setPending] = useState([]) // B32: закрепления, ждущие решения
  const [decideModal, setDecideModal] = useState(null) // { a, accept } — подтверждение
  const fileInputRef = useRef(null)

  // При открытии профиля перечитываем пользователя — ФИО/аватар связанного
  // Сотрудника могли измениться в разделе «Сотрудники» после логина.
  useEffect(() => {
    refreshUser()
  }, [refreshUser])

  const employee = user.employee

  useEffect(() => {
    if (employee?.id) {
      getMySimCards(employee.id).then(setSimCards)
      getMyPasses(employee.id).then(setPasses)
      getMyEquipment(employee.id).then(setEquipment)
      getMyTransport(employee.id).then(setTransport).catch(() => setTransport([]))
      getMyWorkPlacement().then((d) => {
        setTools(d.tools || [])
        setWorkplaces(d.workplaces || [])
        setParkingSpots(d.parking_spots || [])
      })
      getMyPendingAssignments().then(setPending).catch(() => setPending([]))
    }
  }, [employee?.id])

  const reloadHeldObjects = () => {
    if (!employee?.id) return
    getMyEquipment(employee.id).then(setEquipment)
    getMySimCards(employee.id).then(setSimCards)
    getMyPasses(employee.id).then(setPasses)
    getMyTransport(employee.id).then(setTransport).catch(() => {})
    getMyWorkPlacement().then((d) => setTools(d.tools || []))
  }

  // Решение подтверждается модалкой (случайный клик не срабатывает мгновенно);
  // отказ требует причину, которая уходит в историю.
  const doDecide = async (a, accept, comment) => {
    await (accept ? acceptAssignment(a.id, comment) : rejectAssignment(a.id, comment))
    setPending((prev) => prev.filter((x) => x.id !== a.id))
    reloadHeldObjects()
  }
  // Объект, ожидающий решения, показываем только в блоке «Ожидают вашего
  // решения» — из обычных блоков раздела исключаем (без дублей).
  const pendingKey = new Set(pending.map((a) => `${a.object_kind}:${a.object_id}`))
  const shownEquipment = equipment.filter((e) => !pendingKey.has(`equipment:${e.id}`))
  const shownSims = simCards.filter((s) => !pendingKey.has(`sim:${s.id}`))
  const shownPasses = passes.filter((p) => !pendingKey.has(`pass:${p.id}`))
  const shownTransport = transport.filter((t) => !pendingKey.has(`transport:${t.id}`))
  const shownTools = tools.filter((t) => !pendingKey.has(`tool:${t.id}`))
  const displayName = employee?.full_name || user.email

  const onAvatarSelected = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !employee) return
    setUploadingAvatar(true)
    try {
      await uploadEmployeeAvatar(employee.id, file)
      await refreshUser()
    } finally {
      setUploadingAvatar(false)
      e.target.value = ''
    }
  }

  const onRemoveAvatar = async () => {
    if (!employee) return
    setUploadingAvatar(true)
    try {
      await deleteEmployeeAvatar(employee.id)
      await refreshUser()
    } finally {
      setUploadingAvatar(false)
    }
  }

  // Клик по аватару: если фото есть — меню Загрузить/Удалить (как логотип
  // компании), иначе сразу выбор файла.
  const onAvatarClick = () => {
    if (!employee) return
    if (employee.avatar) setAvatarMenu((v) => !v)
    else fileInputRef.current?.click()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ width: '100%', maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Card style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div style={{ flex: 'none', position: 'relative' }}>
            <span
              style={{
                width: 66,
                height: 66,
                borderRadius: '50%',
                background: 'var(--color-fill-active-tint)',
                color: 'var(--color-text-secondary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 22,
                fontWeight: 600,
                overflow: 'hidden',
                cursor: employee ? 'pointer' : 'default',
                position: 'relative',
              }}
              onClick={onAvatarClick}
              title={employee ? (employee.avatar ? 'Действия с фото' : 'Загрузить фото') : undefined}
              aria-haspopup={employee?.avatar ? 'menu' : undefined}
              aria-expanded={employee?.avatar ? avatarMenu : undefined}
            >
              {employee?.avatar ? <img src={employee.avatar.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : nameInitials(displayName)}
              {uploadingAvatar ? <Spinner size={20} /> : null}
            </span>
            {avatarMenu && employee?.avatar ? (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 45 }} onClick={() => setAvatarMenu(false)} />
                <div
                  role="menu"
                  style={{ position: 'absolute', top: 72, left: 0, zIndex: 46, minWidth: 168, padding: 6, display: 'flex', flexDirection: 'column', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12, boxShadow: 'var(--shadow-block)' }}
                >
                  <button type="button" style={avatarMenuItem} onClick={() => { setAvatarMenu(false); fileInputRef.current?.click() }}>
                    Загрузить новый
                  </button>
                  <button type="button" style={{ ...avatarMenuItem, color: 'var(--color-error)' }} onClick={() => { setAvatarMenu(false); onRemoveAvatar() }}>
                    Удалить
                  </button>
                </div>
              </>
            ) : null}
          </div>
          {employee ? <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onAvatarSelected} /> : null}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8 }}>
            <div style={{ fontSize: 20, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{displayName}</div>
            {/* B44. Строка кнопок: «Уведомления» → раздел, «Выход» → выход.
                Высота (ФИО + кнопки) укладывается в высоту аватара (66px). */}
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={() => navigate('/notifications')} style={notifBtnStyle}>
                <Icon name="bell" size={15} strokeWidth={2} />
                Уведомления
              </button>
              <button type="button" onClick={logout} style={logoutBtnStyle}>
                Выход
              </button>
            </div>
          </div>
        </Card>

        <Card>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Данные учётной записи</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 28px' }}>
            <div>
              <Field label="Email" value={user.email} />
              <Button variant="secondary" style={{ marginTop: 16 }} onClick={() => setShowChangeEmail(true)}>
                Сменить email
              </Button>
            </div>
            <div>
              <Field label="Роль" value={roleLabel(user.role)} />
              <Button variant="secondary" style={{ marginTop: 16 }} onClick={() => setShowChangePassword(true)}>
                Сменить пароль
              </Button>
            </div>
          </div>
        </Card>

        {employee ? (
          <Card>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Обо мне</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 28px' }}>
              <Field label="Имя" value={employee.first_name} />
              <Field label="Фамилия" value={employee.last_name} />
              <Field label="Отдел" value={employee.department} />
              <Field label="Должность" value={employee.position} />
            </div>
          </Card>
        ) : null}

        {employee && pending.length ? (
          <Card>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Ожидают вашего решения</div>
            <div style={{ fontSize: 12.5, color: 'var(--color-text-placeholder)', marginBottom: 12 }}>
              За вами закрепили имущество — подтвердите или отклоните получение
            </div>
            {pending.map((a) => (
              <div key={a.id} style={{ padding: '11px 13px', background: 'var(--color-surface)', boxShadow: 'inset 0 0 0 1px var(--color-border)', borderRadius: 10, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                  <LeadIconCircle name={KIND_ICON[a.object_kind] || 'tag'} />
                  {(() => {
                    // Для SIM и пропусков/ключей показываем те же поля, что и в
                    // списках закреплённого (полные объекты уже загружены), иначе
                    // номер дублировался бы в двух строках.
                    if (a.object_kind === 'sim') {
                      const sim = simCards.find((s) => s.id === a.object_id)
                      if (sim) return <SimCardInfo sim={sim} />
                    }
                    if (a.object_kind === 'pass') {
                      const pass = passes.find((p) => p.id === a.object_id)
                      if (pass) return <PassInfo pass={pass} />
                    }
                    return (
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {a.object_label || a.object_kind_display}
                          {a.object_kind === 'tool' && a.return_quantity ? ` · ${a.return_quantity} шт.` : ''}
                        </div>
                        {a.object_number ? (
                          <div style={{ font: '500 11.5px var(--font-mono)', color: 'var(--color-text-placeholder)' }}>{a.object_number}</div>
                        ) : null}
                      </div>
                    )
                  })()}
                </div>
                <div style={{ display: 'flex', gap: 8, flex: 'none' }}>
                  <button
                    type="button" title="Отказаться" aria-label="Отказаться"
                    onClick={() => setDecideModal({ a, accept: false })}
                    style={{ width: 40, height: 40, flex: 'none', borderRadius: 10, border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Icon name="x" size={18} strokeWidth={2.2} />
                  </button>
                  <button
                    type="button" title="Принять" aria-label="Принять"
                    onClick={() => setDecideModal({ a, accept: true })}
                    style={{ width: 40, height: 40, flex: 'none', borderRadius: 10, border: 'none', background: 'var(--color-text-primary)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Icon name="check" size={18} strokeWidth={2.2} />
                  </button>
                </div>
              </div>
            ))}
          </Card>
        ) : null}

        {employee && workplaces.length ? (
          <Card>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Мои рабочие места</div>
            {workplaces.map((wp) => (
              <div key={wp.id} style={{ padding: '11px 13px', background: 'var(--color-surface)', boxShadow: 'inset 0 0 0 1px var(--color-border)', borderRadius: 10, marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <LeadIconCircle name="briefcase" />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600 }}>{wp.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)' }}>{wp.location}</div>
                  </div>
                </div>
                {wp.equipment?.length || wp.tools?.length ? (
                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <div style={{ fontSize: 11.5, color: 'var(--color-text-placeholder)' }}>На этом рабочем месте</div>
                    {(wp.equipment || []).map((eq) => (
                      <div key={`e${eq.id}`} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                        <Icon name="tag" size={13} strokeWidth={2} style={{ color: 'var(--color-text-muted)', flex: 'none' }} />
                        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {eq.type_and_model} · <span style={{ font: '500 12px var(--font-mono)', color: 'var(--color-text-placeholder)' }}>{eq.inventory_number}</span>
                        </span>
                      </div>
                    ))}
                    {(wp.tools || []).map((t) => (
                      <div key={`t${t.id}`} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                        <Icon name="hammer" size={13} strokeWidth={2} style={{ color: 'var(--color-text-muted)', flex: 'none' }} />
                        <span>{t.name} · {t.quantity} шт.</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </Card>
        ) : null}

        {employee && parkingSpots.length ? (
          <Card>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Мои парковочные места</div>
            {parkingSpots.map((sp) => (
              <div key={sp.id} style={{ padding: '11px 13px', background: 'var(--color-surface)', boxShadow: 'inset 0 0 0 1px var(--color-border)', borderRadius: 10, marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <LeadIconCircle name="square-parking" />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600 }}>{sp.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)' }}>{sp.location}</div>
                    {sp.plan_file?.url ? <PlanLink file={sp.plan_file} style={{ marginTop: 5 }} /> : null}
                  </div>
                </div>
              </div>
            ))}
          </Card>
        ) : null}

        {employee ? (
          <Card>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Выданное мне оборудование</div>
            {shownEquipment.length === 0 ? (
              <div style={{ fontSize: 13.5, color: 'var(--color-text-muted)' }}>За вами не закреплено оборудования.</div>
            ) : (
              shownEquipment.map((eq) => (
                <div key={eq.id} style={P_ROW}>
                  <LeadIconCircle name="tag" />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--color-text-primary)' }}>{eq.type_and_model}</div>
                    <div style={{ font: '500 12px var(--font-mono)', color: 'var(--color-text-placeholder)', marginTop: 2 }}>{eq.inventory_number}</div>
                  </div>
                </div>
              ))
            )}
          </Card>
        ) : null}

        {employee ? (
          <Card>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Выданный мне транспорт</div>
            {shownTransport.length === 0 ? (
              <div style={{ fontSize: 13.5, color: 'var(--color-text-muted)' }}>За вами не закреплён транспорт.</div>
            ) : (
              shownTransport.map((t) => (
                <div key={t.id} style={{ background: 'var(--color-surface)', boxShadow: 'inset 0 0 0 1px var(--color-border)', borderRadius: 10, marginBottom: 8, padding: '11px 13px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <LeadIconCircle name="car" />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--color-text-primary)' }}>{t.type_and_model}</div>
                      <div style={{ font: '500 12px var(--font-mono)', color: 'var(--color-text-placeholder)', marginTop: 2 }}>
                        {[t.plate, t.inventory_number].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                  </div>
                  <TransportParkingLine parking={t.parking} />
                </div>
              ))
            )}
          </Card>
        ) : null}

        {employee ? (
          <Card>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Выданный мне инструмент</div>
            {shownTools.length === 0 ? (
              <div style={{ fontSize: 13.5, color: 'var(--color-text-muted)' }}>За вами не закреплено инструментов.</div>
            ) : (
              shownTools.map((t) => (
                <div key={t.id} style={P_ROW}>
                  <LeadIconCircle name="hammer" />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--color-text-primary)' }}>{t.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)', marginTop: 2 }}>{t.quantity} шт.</div>
                  </div>
                </div>
              ))
            )}
          </Card>
        ) : null}

        {employee ? (
          <Card>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Выданные мне SIM</div>
            {shownSims.length === 0 ? (
              <div style={{ fontSize: 13.5, color: 'var(--color-text-muted)' }}>За вами не закреплено SIM-карт.</div>
            ) : (
              shownSims.map((sim) => (
                <div key={sim.id} style={P_ROW}>
                  <LeadIconCircle name="radio-tower" />
                  <SimCardInfo sim={sim} />
                </div>
              ))
            )}
          </Card>
        ) : null}

        {employee ? (
          <Card>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Выданные мне средства доступа</div>
            {shownPasses.length === 0 ? (
              <div style={{ fontSize: 13.5, color: 'var(--color-text-muted)' }}>За вами не закреплено средств доступа.</div>
            ) : (
              shownPasses.map((pass) => (
                <div key={pass.id} style={P_ROW}>
                  <LeadIconCircle name="key-square" />
                  <PassInfo pass={pass} />
                </div>
              ))
            )}
          </Card>
        ) : null}

      </div>

      {showChangePassword ? <ChangePasswordModal onClose={() => setShowChangePassword(false)} onDone={() => setShowChangePassword(false)} /> : null}
      {showChangeEmail ? <ChangeEmailModal onClose={() => setShowChangeEmail(false)} /> : null}
      {decideModal?.accept ? (
        <ConfirmModal
          title="Подтвердите получение"
          message={`Подтвердите получение «${decideModal.a.object_label || decideModal.a.object_kind_display}».`}
          confirmLabel="Принять"
          danger={false}
          onConfirm={() => doDecide(decideModal.a, true, '')}
          onClose={() => setDecideModal(null)}
        />
      ) : null}
      {decideModal && !decideModal.accept ? (
        <RejectAssignmentModal
          assignment={decideModal.a}
          onConfirm={(comment) => doDecide(decideModal.a, false, comment)}
          onClose={() => setDecideModal(null)}
        />
      ) : null}
    </div>
  )
}

// Строка выданного объекта с ведущей иконкой (как чемоданчик у рабочих мест).
const P_ROW = { display: 'flex', alignItems: 'center', gap: 8, padding: '11px 13px', background: 'var(--color-surface)', boxShadow: 'inset 0 0 0 1px var(--color-border)', borderRadius: 10, marginBottom: 8 }

function Field({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 500 }}>{value || '—'}</div>
    </div>
  )
}
